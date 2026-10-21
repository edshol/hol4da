// eslint-disable-next-line import/no-unresolved
import { toClassName } from '../../scripts/aem.js';

function hasWrapper(el) {
  return !!el.firstElementChild && window.getComputedStyle(el.firstElementChild).display === 'block';
}

export default async function decorate(block) {
  // section を取得（親にあたる要素）
  const section = block.closest('.section');
  // ==== 変更1: 以前の選択状態を section.dataset に保持 ====
  const prevSelectedId = section?.dataset.selectedTabId;
  console.log('prevSelectedId:', prevSelectedId);

  // build tablist
  const tablist = document.createElement('div');
  tablist.className = 'tabs-list';
  tablist.setAttribute('role', 'tablist');

  // decorate tabs and tabpanels
  const tabs = [...block.children].map((child) => child.firstElementChild);
  tabs.forEach((tab, i) => {
    const id = toClassName(tab.textContent);

    // decorate tabpanel
    const tabpanel = block.children[i];
    tabpanel.className = 'tabs-panel';
    tabpanel.id = `tabpanel-${id}`;
    tabpanel.setAttribute('aria-hidden', !!i);
    tabpanel.setAttribute('aria-labelledby', `tab-${id}`);
    tabpanel.setAttribute('role', 'tabpanel');
    if (!hasWrapper(tabpanel.lastElementChild)) {
      tabpanel.lastElementChild.innerHTML = `<p>${tabpanel.lastElementChild.innerHTML}</p>`;
    }

    // build tab button
    const button = document.createElement('button');
    button.className = 'tabs-tab';
    button.id = `tab-${id}`;
    button.innerHTML = tab.innerHTML;
    button.setAttribute('aria-controls', `tabpanel-${id}`);

    // ==== 変更2: 以前の選択を優先。なければ先頭タブ ====
    const isSelected = prevSelectedId ? (button.id === prevSelectedId) : (i === 0);
    button.setAttribute('aria-selected', isSelected);
    button.setAttribute('role', 'tab');
    button.setAttribute('type', 'button');

    // ==== 変更3: 初期パネル表示も更新 ====
    tabpanel.setAttribute('aria-hidden', !isSelected);

    button.addEventListener('click', () => {
      block.querySelectorAll('[role=tabpanel]').forEach((panel) => {
        panel.setAttribute('aria-hidden', true);
      });
      tablist.querySelectorAll('button').forEach((btn) => {
        btn.setAttribute('aria-selected', false);
      });
      tabpanel.setAttribute('aria-hidden', false);
      button.setAttribute('aria-selected', true);

      // ==== 変更4: 選択状態を section.dataset に保存 ====
      if (section) {
        section.dataset.selectedTabId = button.id;
        console.log('保存した selectedTabId:', section.dataset.selectedTabId);
      }
    });

    tablist.append(button);
    tab.remove();
  });

  block.prepend(tablist);
}
