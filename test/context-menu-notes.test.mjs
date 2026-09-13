import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';

test('note menus separate selection annotation, page note and existing-note editing', async () => {
  const source = readFileSync(new URL('../src/scripts/background.js', import.meta.url), 'utf8');
  const menus = new Map();
  const context = vm.createContext({
    chrome: { contextMenus: {
      removeAll: async () => menus.clear(),
      create: menu => menus.set(menu.id, menu),
      update: async (id, change) => Object.assign(menus.get(id), change)
    } },
    easyReadTools: { getMessageForLocales: key => key },
    highlightContextByTab: new Map(), console
  });
  vm.runInContext(source.slice(source.indexOf('async function installContextMenus()'), source.indexOf('chrome.contextMenus.onClicked.addListener(contextMenusOnClick)')), context);
  await vm.runInContext('installContextMenus()', context);
  assert.deepEqual(Array.from(menus.get('selection-add-annotation').contexts), ['selection']);
  assert.equal(menus.get('page-add-note').title, 'contextMenus_title_page_addNote');
  for (const state of [
    { hasSelection: false, noteId: null, annotationId: null },
    { hasSelection: true, noteId: null, annotationId: null },
    { hasSelection: false, noteId: 1, annotationId: null }
  ]) {
    context.state = state;
    await vm.runInContext('updateHighlightContextMenu(1, state)', context);
    assert.equal(menus.get('page-add-note').visible, !state.hasSelection && state.noteId === null);
    assert.equal(menus.get('edit-existing-note').visible, state.noteId !== null);
    assert.equal(menus.get('selection-add-annotation').title, 'contextMenus_title_selection_addAnnotation');
  }
});
