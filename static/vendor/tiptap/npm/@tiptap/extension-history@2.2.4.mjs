/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-history@2.2.4/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Extension as t}from"/vendor/tiptap/npm/@tiptap/core@2.2.4.mjs";import{history as e,redo as n,undo as i}from"/vendor/tiptap/npm/@tiptap/pm@2.2.4/history.mjs";const d=t.create({name:"history",addOptions(){return{depth:100,newGroupDelay:500}},addCommands(){return{undo:()=>({state:o,dispatch:r})=>i(o,r),redo:()=>({state:o,dispatch:r})=>n(o,r)}},addProseMirrorPlugins(){return[e(this.options)]},addKeyboardShortcuts(){return{"Mod-z":()=>this.editor.commands.undo(),"Shift-Mod-z":()=>this.editor.commands.redo(),"Mod-y":()=>this.editor.commands.redo(),"Mod-\u044F":()=>this.editor.commands.undo(),"Shift-Mod-\u044F":()=>this.editor.commands.redo()}}});export{d as History,d as default};
//# sourceMappingURL=/sm/95b17132ab07df21fac55c10eebd8096c85aa85fd40439650db8462f63ebd89f.map