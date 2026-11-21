/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-strike@2.2.4/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Mark as n,markPasteRule as i,markInputRule as a,isMacOS as u,mergeAttributes as o}from"/vendor/tiptap/npm/@tiptap/core@2.2.4.mjs";const e=/(?:^|\s)((?:~~)((?:[^~]+))(?:~~))$/,r=/(?:^|\s)((?:~~)((?:[^~]+))(?:~~))/g,s=n.create({name:"strike",addOptions(){return{HTMLAttributes:{}}},parseHTML(){return[{tag:"s"},{tag:"del"},{tag:"strike"},{style:"text-decoration",consuming:!1,getAttrs:t=>t.includes("line-through")?{}:!1}]},renderHTML({HTMLAttributes:t}){return["s",o(this.options.HTMLAttributes,t),0]},addCommands(){return{setStrike:()=>({commands:t})=>t.setMark(this.name),toggleStrike:()=>({commands:t})=>t.toggleMark(this.name),unsetStrike:()=>({commands:t})=>t.unsetMark(this.name)}},addKeyboardShortcuts(){const t={};return u()?t["Mod-Shift-s"]=()=>this.editor.commands.toggleStrike():t["Ctrl-Shift-s"]=()=>this.editor.commands.toggleStrike(),t},addInputRules(){return[a({find:e,type:this.type})]},addPasteRules(){return[i({find:r,type:this.type})]}});export{s as Strike,s as default,e as inputRegex,r as pasteRegex};
//# sourceMappingURL=/sm/cd4702f2c8255134b5fb579c688c403a32201f5f62730b0181846ce6b07c0049.map