import select from 'select-dom';
import {setFetch} from 'push-form';

// `content.fetch` is Firefox’s way to make fetches from the page instead of from a different context
// This will set the correct `origin` header without having to use XMLHttpRequest
// https://stackoverflow.com/questions/47356375/firefox-fetch-api-how-to-omit-the-origin-header-in-the-request
// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#XHR_and_Fetch
if (window.content?.fetch) {
	setFetch(window.content.fetch);
}

/**
 * Append to an element, but before a element that might not exist.
 * @param  parent  Element (or its selector) to which append the `child`
 * @param  before  Selector of the element that `child` should be inserted before
 * @param  child   Element to append
 * @example
 *
 * <parent>
 *   <yes/>
 *   <oui/>
 *   <nope/>
 * </parent>
 *
 * appendBefore('parent', 'nope', <sì/>);
 *
 * <parent>
 *   <yes/>
 *   <oui/>
 *   <sì/>
 *   <nope/>
 * </parent>
 */
export const appendBefore = (parent: string | Element, before: string, child: Element): void => {
	if (typeof parent === 'string') {
		parent = select(parent)!;
	}

	// Select direct children only
	const beforeElement = select(`:scope > :is(${before})`, parent);
	if (beforeElement) {
		beforeElement.before(child);
	} else {
		parent.append(child);
	}
};

export const wrap = (target: Element | ChildNode, wrapper: Element): void => {
	target.before(wrapper);
	wrapper.append(target);
};

export const wrapAll = (targets: Array<Element | ChildNode>, wrapper: Element): void => {
	targets[0].before(wrapper);
	wrapper.append(...targets);
};

export const isEditable = (node: unknown): boolean => node instanceof HTMLTextAreaElement
		|| node instanceof HTMLInputElement
		|| (node instanceof HTMLElement && node.isContentEditable);

export const frame = async (): Promise<number> => new Promise(resolve => {
	requestAnimationFrame(resolve);
});

/**
 * Get the element used to make sure that the selected tab is updated when using the back/forward buttons.
 * Currently, this element is of the form `<meta name="selected-link" value="repo_commits">`,
 * corresponding to a tab element with the form
 * `<a class="js-selected-navigation-item" data-selected-links="repo_source repo_commits repo_releases">`.
 *
 * A `turbo:load` handler selects this element's respective tab.
 * When this element is added to `document.head`, a mutation observer selects this element's respective tab.
 */
export function getSelectedLinkElement(): HTMLMetaElement {
	return document.head.querySelector<HTMLMetaElement>('meta[name="selected-link"]')!;
}

/**
 * This function exists to document GitHub's behavior. You shouldn't need to call it.
 *
 * As of 2022-10-28, it matches `updateSelectedRepoTab(meta: HtmlMetaElement)` from GitHub's
 * `app/assets/modules/github/behaviors/side-navigation.ts`, which is called in a `turbo:load` handler.
 */
export function updateSelectedTab(selectedLinkElement: HTMLMetaElement): void {
	const selectedTab = selectedLinkElement && selectedLinkElement.getAttribute('value');
	if (!selectedTab) {
		return;
	}

	for (const navItem of document.querySelectorAll('.js-sidenav-container-pjax .js-selected-navigation-item')) {
		const itemIsSelected = (navItem.getAttribute('data-selected-links') || '').split(' ').indexOf(selectedTab) >= 0;
		itemIsSelected ? navItem.setAttribute('aria-current', 'page') : navItem.removeAttribute('aria-current');
		navItem.classList.toggle('selected', itemIsSelected);
	}
}

/**
 * Updates the selected tab based on the selected link. You shouldn't need to call it.
 */
export function tryUpdatingSelectedTab(selectedLinkElement: HTMLMetaElement): boolean {
	const selectedTab = selectedLinkElement && selectedLinkElement.getAttribute('value');
	if (!selectedTab) {
		return false;
	}

	if (document.querySelector(`.js-sidenav-container-pjax .js-selected-navigation-item[data-selected-links~="${CSS.escape(selectedTab)}"`) === null) {
		return false;
	}

	for (const navItem of document.querySelectorAll('.js-sidenav-container-pjax .js-selected-navigation-item')) {
		const itemIsSelected = (navItem.getAttribute('data-selected-links') || '').split(' ').indexOf(selectedTab) >= 0;
		itemIsSelected ? navItem.setAttribute('aria-current', 'page') : navItem.removeAttribute('aria-current');
		navItem.classList.toggle('selected', itemIsSelected);
	}
	return true;
}

/**
 * This function exists to document GitHub's behavior. You shouldn't need to call it.
 *
 * As of 2022-10-28, it matches the `document.head` child list mutation observer from GitHub's
 * `app/assets/modules/github/behaviors/side-navigation.ts`.
 */
export const selectedTabMutationCallback: MutationCallback = (mutations) => {
	for (const mutation of mutations) {
		for (const node of mutation.addedNodes) {
			if (!(node instanceof HTMLMetaElement)) {
				continue;
			}

			if (node.getAttribute('name') === 'selected-link') {
				updateSelectedTab(node);
			}
		}
	}
}

/**
 * Select the tab with the given
 */
export function selectLink(link: string): void {
	if (link.indexOf(' ') >= 0) {
		throw new Error(`selected-link values cannot contain spaces: ${link}`);
	}
	const selectedLinkElement = getSelectedLinkElement();
	const originalLink = selectedLinkElement.getAttribute('value');
	selectedLinkElement.setAttribute('value', link);
	const selectedLinkUpdated = tryUpdatingSelectedTab(selectedLinkElement);
	if (!selectedLinkUpdated) {
		let errMsg = `selected-link value matches no navigation item: ${CSS.escape(link)}`;
		if (originalLink !== null) {
			selectedLinkElement.setAttribute('value', originalLink);
			errMsg += `, reverted to ${CSS.escape(originalLink)}`;
		}
		throw new Error(errMsg);
	}
}

export function highlightTab(tabElement: Element): void {
	tabElement.classList.add('selected');
	tabElement.setAttribute('aria-current', 'page');
};

export function unhighlightTab(tabElement: Element): void {
	tabElement.classList.remove('selected');
	tabElement.removeAttribute('aria-current');
};

const matchString = (matcher: RegExp | string, string: string): boolean =>
	typeof matcher === 'string' ? matcher === string : matcher.test(string);

const escapeMatcher = (matcher: RegExp | string): string =>
	typeof matcher === 'string' ? `"${matcher}"` : String(matcher);

// eslint-disable-next-line @typescript-eslint/ban-types -- Nodes may be exactly `null`
export const assertNodeContent = <N extends Text | ChildNode>(node: N | null, expectation: RegExp | string): N => {
	if (!node || !(node instanceof Text)) {
		console.warn('TypeError', node);
		throw new TypeError(`Expected Text node, received ${String(node?.nodeName)}`);
	}

	const content = node.textContent!.trim();
	if (!matchString(expectation, content)) {
		console.warn('Error', node.parentElement);
		throw new Error(`Expected node matching ${escapeMatcher(expectation)}, found ${escapeMatcher(content)}`);
	}

	return node;
};

export const removeTextNodeContaining = (node: Text | ChildNode, expectation: RegExp | string): void => {
	assertNodeContent(node, expectation);
	node.remove();
};
