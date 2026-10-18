import {workspaceOrigin,captureURL} from './url.js';
const MENU='threadline-save-selection';
chrome.runtime.onInstalled.addListener(()=>{chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:MENU,title:'Save in Threadline',contexts:['selection']}));});
chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.contextMenus.onClicked.addListener(async info=>{
    if(info.menuItemId!==MENU)return;
    try {
        const setting=await chrome.storage.local.get('workspace_origin');
        if(!setting.workspace_origin)throw new Error('First configure and confirm your own Threadline workspace address.');
        const url=captureURL(workspaceOrigin(setting.workspace_origin),info.selectionText,info.pageUrl||'');
        await chrome.tabs.create({url});
    } catch(e) {
        await chrome.storage.local.set({last_error:e.message});
        await chrome.runtime.openOptionsPage();
    }
});
