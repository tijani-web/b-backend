import { ethers } from 'ethers';
import { Mutex } from 'async-mutex';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// Mutex to prevent Nonce collisions during concurrent withdrawals
const withdrawalMutex = new Mutex();

export class CustodyService {
  private static get mnemonic(): string {
    const m = process.env.MASTER_MNEMONIC;
    if (!m) {
      // Development fallback so the app doesn't crash if .env is missing.
      // NEVER use this mnemonic for real funds!
      return "test test test test test test test test test test test junk";
    }
    return m;
  }

  // Use Cloudflare public ETH node for Mainnet (or Polygon if you switch)
  private static provider = new ethers.JsonRpcProvider('https://cloudflare-eth.com');
  
  // Etherscan API Key for indexing
  private static get etherscanApiKey(): string {
    return process.env.ETHERSCAN_API_KEY || '';
  }

  /**
   * Generates a deposit address for a specific user using HD Derivation.
   */
  static async generateDepositAddress(userId: string, asset: string): Promise<string> {
    // 1. Hash the UUID into a 31-bit integer for BIP44 path
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    const index = parseInt(hash.substring(0, 8), 16) & 0x7FFFFFFF;

    // 2. Derive HD Node: m / purpose' / coin_type' / account' / change / address_index
    const path = `m/44'/60'/0'/0/${index}`;
    
    const hdNode = ethers.HDNodeWallet.fromPhrase(this.mnemonic, undefined, path);
    return hdNode.address;
  }

  /**
   * Executes a withdrawal from the master Hot Wallet.
   */
  static async withdraw(asset: string, amount: number, address: string): Promise<string> {
    // 1. Get Hot Wallet (Index 1 reserved for Hot Wallet to separate from user deposits)
    const hotWalletPath = `m/44'/60'/0'/1/0`;
    const wallet = ethers.HDNodeWallet.fromPhrase(this.mnemonic, undefined, hotWalletPath).connect(this.provider);

    // 2. Lock Mutex to prevent Nonce collisions if multiple users withdraw simultaneously
    const release = await withdrawalMutex.acquire();
    try {
      if (asset.toUpperCase() === 'ETH') {
        const tx = await wallet.sendTransaction({
          to: address,
          value: ethers.parseEther(amount.toString())
        });
        return tx.hash;
      } else {
        // For USDT/ERC-20, assuming USDT Mainnet for this example:
        const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        const abi = [
            "function transfer(address to, uint amount) returns (bool)"
        ];
        const contract = new ethers.Contract(USDT_ADDRESS, abi, wallet);
        // USDT has 6 decimals
        const tx = await contract.transfer(address, ethers.parseUnits(amount.toString(), 6));
        return tx.hash;
      }
    } catch (error) {
      logger.error(`CustodyService Error (Withdraw ${asset}):`, error);
      throw error;
    } finally {
      release(); // ALWAYS release the lock!
    }
  }

  /**
   * Fetches new deposits from Etherscan API to solve the "Lazy Sync Sweeping" bug.
   */
  static async getNewDeposits(address: string, asset: string): Promise<{ txHash: string; amount: number }[]> {
    if (!this.etherscanApiKey) {
      logger.warn('ETHERSCAN_API_KEY missing. Cannot fetch live deposits.');
      return [];
    }

    try {
      let url = '';
      if (asset.toUpperCase() === 'ETH') {
        url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${this.etherscanApiKey}`;
      } else if (asset.toUpperCase() === 'USDT') {
        const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${USDT_ADDRESS}&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${this.etherscanApiKey}`;
      } else {
        return [];
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== '1') {
        if (data.message === 'No transactions found') return [];
        throw new Error(`Etherscan Error: ${data.result}`);
      }

      const deposits: { txHash: string; amount: number }[] = [];

      for (const tx of data.result) {
        // Only count INCOMING transactions with 12+ confirmations
        if (tx.to.toLowerCase() === address.toLowerCase() && parseInt(tx.confirmations) >= 12) {
           const decimals = asset.toUpperCase() === 'USDT' ? 6 : 18;
           const amount = Number(ethers.formatUnits(tx.value, decimals));
           deposits.push({ txHash: tx.hash, amount });
        }
      }

      return deposits;
    } catch (error) {
      logger.error('Error fetching deposits from Etherscan:', error);
      return [];
    }
  }
}
