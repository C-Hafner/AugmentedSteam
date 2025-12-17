import Feature from "@Content/Modules/Context/Feature";
import type CCart from "@Content/Features/Store/Cart/CCart";
import Settings from "@Options/Data/Settings";
import Prices from "@Content/Modules/Prices/Prices";
import type {TPriceOverview} from "@Background/Modules/AugmentedSteam/_types";
import CartITADPricesPopup from "./CartITADPricesPopup.svelte";

interface CartItem {
    appid: number;
    priceNode: HTMLElement;
}

export default class FCartITADPrices extends Feature<CCart> {

    override checkPrerequisites(): boolean {
        return Settings.showlowestprice;
    }

    override async apply(): Promise<void> {
        const root = document.querySelector('[data-featuretarget="react-root"]');
        if (!root) { return; }

        // Use MutationObserver to wait for cart content to load
        const observer = new MutationObserver(async () => {
            await this.processCartItems();
        });

        observer.observe(root, {"childList": true, "subtree": true});

        // Also process immediately in case content is already loaded
        await this.processCartItems();
    }

    private processedItems: WeakSet<Element> = new WeakSet();

    private async processCartItems(): Promise<void> {
        // Find cart line items - look for elements that contain app links
        const cartItems = this.findCartItems();

        if (cartItems.length === 0) { return; }

        // Collect all appids for batch fetching
        const appids = cartItems.map(item => item.appid);
        const uniqueAppids = [...new Set(appids)];

        // Fetch ITAD prices for all items
        const prices = new Prices(this.context.user);
        const priceData = await prices.load({ apps: uniqueAppids });

        // Create price lookup map
        const priceMap = new Map<number, TPriceOverview>();
        for (const { type, id, data } of priceData.prices) {
            if (type === "app") {
                priceMap.set(id, data);
            }
        }

        // Attach hover popups to each cart item's price
        for (const item of cartItems) {
            const data = priceMap.get(item.appid);
            if (data && (data.current || data.lowest)) {
                this.attachPricePopup(item.priceNode, data);
            }
        }
    }

    private findCartItems(): CartItem[] {
        const items: CartItem[] = [];

        // Look for cart row elements - Steam's React cart uses different structures
        // Find elements that link to app pages
        const appLinks = document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]');

        for (const link of appLinks) {
            // Skip if already processed
            if (this.processedItems.has(link)) { continue; }

            // Extract appid from link
            const match = link.href.match(/\/app\/(\d+)/);
            if (!match || !match[1]) { continue; }

            const appid = parseInt(match[1], 10);

            // Find the associated price element
            // Walk up to find the cart item container, then find the price within it
            const cartItemContainer = this.findCartItemContainer(link);
            if (!cartItemContainer) { continue; }

            const priceNode = this.findPriceNode(cartItemContainer);
            if (!priceNode) { continue; }

            // Skip if this price node was already processed
            if (this.processedItems.has(priceNode)) { continue; }

            this.processedItems.add(link);
            this.processedItems.add(priceNode);

            items.push({ appid, priceNode });
        }

        return items;
    }

    private findCartItemContainer(element: HTMLElement): HTMLElement | null {
        // Walk up the DOM to find the cart item container
        let current: HTMLElement | null = element;
        let depth = 0;
        const maxDepth = 10;

        while (current && depth < maxDepth) {
            // Check if this element contains both an image and the price container class
            const hasPriceContainer = current.querySelector('.ysGS-IPPWEkwN-O5rr-0V');
            const hasImage = current.querySelector('img');

            if (hasPriceContainer && hasImage) {
                return current;
            }

            // Also check for specific class patterns Steam might use
            if (current.className && typeof current.className === 'string' && (
                current.className.includes('CartRow') ||
                current.className.includes('cart_item') ||
                current.className.includes('CartItem')
            )) {
                return current;
            }

            current = current.parentElement;
            depth++;
        }

        return null;
    }

    private findPriceNode(container: HTMLElement): HTMLElement | null {
        // Steam cart structure - we want the price container div (class: ysGS-IPPWEkwN-O5rr-0V)
        // which wraps the price display. There are TWO elements with this class per item:
        // 1. The price container (contains currency amounts)
        // 2. The Add/Remove buttons container
        // We need to find the one that contains actual price text

        const priceContainers = container.querySelectorAll<HTMLElement>('.ysGS-IPPWEkwN-O5rr-0V');
        for (const priceContainer of priceContainers) {
            const text = priceContainer.textContent || "";
            // Check if this container has price-like content (currency symbols and numbers)
            // but NOT "Add" or "Remove" text
            if (/[$€£¥₽₴₩₹]?\s*[\d.,]+/.test(text) &&
                !text.includes('Add') &&
                !text.includes('Remove')) {
                return priceContainer;
            }
        }

        // Fallback: Find any element containing price text and get its container
        const allElements = container.querySelectorAll('div');
        for (const el of allElements) {
            const text = el.textContent?.trim() || "";
            // Look for price pattern
            if (/^[$€£¥₽₴₩₹]?\s*[\d.,]+\s*[$€£¥₽₴₩₹]?$/.test(text)) {
                // Walk up to find the ysGS container or a reasonable parent
                let parent: HTMLElement | null = el.parentElement;
                while (parent && parent !== container) {
                    if (parent.classList.contains('ysGS-IPPWEkwN-O5rr-0V')) {
                        return parent;
                    }
                    parent = parent.parentElement;
                }
                // If we couldn't find the specific class, return a parent container
                if (el.parentElement?.parentElement) {
                    return el.parentElement.parentElement as HTMLElement;
                }
            }
        }

        return null;
    }

    private attachPricePopup(priceNode: HTMLElement, data: TPriceOverview): void {
        // Add hover styling
        priceNode.classList.add("es_itad_pricing_hover");

        // Create the popup component
        new CartITADPricesPopup({
            target: document.body,
            props: {
                data,
                priceNode
            }
        });
    }
}
