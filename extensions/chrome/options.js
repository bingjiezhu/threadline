import {workspaceOrigin} from './url.js';
const form=document.querySelector('form'),status=document.querySelector('#status');
const existing=await chrome.storage.local.get(['workspace_origin','last_error']);
if(existing.workspace_origin){document.querySelector('#origin').value=existing.workspace_origin;document.querySelector('#consent').checked=true;}
if(existing.last_error){status.textContent=existing.last_error;await chrome.storage.local.remove('last_error');}
form.addEventListener('submit',async e=>{e.preventDefault();try{const origin=workspaceOrigin(document.querySelector('#origin').value);await chrome.storage.local.set({workspace_origin:origin});status.textContent='Saved. Select text on a web page and choose “Save in Threadline”.';}catch(error){status.textContent=error.message;}});
