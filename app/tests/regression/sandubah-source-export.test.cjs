'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {auditText}=require('../../scripts/export-sandubah-source.cjs');
test('exportação bloqueia segredos e termos privados sem gravá-los na lista pública',()=>{
  for(const text of ['ghp_'+'x'.repeat(32),'sk-'+'x'.repeat(32),'-----BEGIN '+'PRIVATE KEY-----'])assert.throws(()=>auditText(text));
  assert.throws(()=>auditText('Documento de Projeto Restrito',['Projeto Restrito']));assert.doesNotThrow(()=>auditText('Projeto Aurora de demonstração. Código sem dados pessoais.'));
});
