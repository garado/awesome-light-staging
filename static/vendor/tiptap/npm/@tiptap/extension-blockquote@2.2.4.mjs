/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-blockquote@2.2.4/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Node as r,wrappingInputRule as n,mergeAttributes as u}from"/vendor/tiptap/npm/@tiptap/core@2.2.4.mjs";const e=/^\s*>\s$/,o=r.create({name:"blockquote",addOptions(){return{HTMLAttributes:{}}},content:"block+",group:"block",defining:!0,parseHTML(){return[{tag:"blockquote"}]},renderHTML({HTMLAttributes:t}){return["blockquote",u(this.options.HTMLAttributes,t),0]},addCommands(){return{setBlockquote:()=>({commands:t})=>t.wrapIn(this.name),toggleBlockquote:()=>({commands:t})=>t.toggleWrap(this.name),unsetBlockquote:()=>({commands:t})=>t.lift(this.name)}},addKeyboardShortcuts(){return{"Mod-Shift-b":()=>this.editor.commands.toggleBlockquote()}},addInputRules(){return[n({find:e,type:this.type})]}});export{o as Blockquote,o as default,e as inputRegex};
//# sourceMappingURL=/sm/00d0eb68ab9a4e2bbb16d467574d6294e9a46743899eea25f5221181cfc96c6a.map