/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-hard-break@2.2.4/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Node as f,mergeAttributes as l}from"/vendor/tiptap/npm/@tiptap/core@2.2.4.mjs";const n=f.create({name:"hardBreak",addOptions(){return{keepMarks:!0,HTMLAttributes:{}}},inline:!0,group:"inline",selectable:!1,parseHTML(){return[{tag:"br"}]},renderHTML({HTMLAttributes:e}){return["br",l(this.options.HTMLAttributes,e)]},renderText(){return`
`},addCommands(){return{setHardBreak:()=>({commands:e,chain:s,state:a,editor:o})=>e.first([()=>e.exitCode(),()=>e.command(()=>{const{selection:r,storedMarks:i}=a;if(r.$from.parent.type.spec.isolating)return!1;const{keepMarks:d}=this.options,{splittableMarks:u}=o.extensionManager,t=i||r.$to.parentOffset&&r.$from.marks();return s().insertContent({type:this.name}).command(({tr:m,dispatch:p})=>{if(p&&t&&d){const k=t.filter(c=>u.includes(c.type.name));m.ensureMarks(k)}return!0}).run()})])}},addKeyboardShortcuts(){return{"Mod-Enter":()=>this.editor.commands.setHardBreak(),"Shift-Enter":()=>this.editor.commands.setHardBreak()}}});export{n as HardBreak,n as default};
//# sourceMappingURL=/sm/acbefd283549079abcbe070ebd2481d81406b834d8a6069151a98135881783f0.map