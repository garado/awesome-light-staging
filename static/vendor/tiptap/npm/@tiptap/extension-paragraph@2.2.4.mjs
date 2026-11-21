/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-paragraph@2.2.4/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Node as e,mergeAttributes as a}from"/vendor/tiptap/npm/@tiptap/core@2.2.4.mjs";const t=e.create({name:"paragraph",priority:1e3,addOptions(){return{HTMLAttributes:{}}},group:"block",content:"inline*",parseHTML(){return[{tag:"p"}]},renderHTML({HTMLAttributes:r}){return["p",a(this.options.HTMLAttributes,r),0]},addCommands(){return{setParagraph:()=>({commands:r})=>r.setNode(this.name)}},addKeyboardShortcuts(){return{"Mod-Alt-0":()=>this.editor.commands.setParagraph()}}});export{t as Paragraph,t as default};
//# sourceMappingURL=/sm/66b3757f2d0f46db8a0cc756d97deb39f10adcc683803c6109613c7e519f00f9.map