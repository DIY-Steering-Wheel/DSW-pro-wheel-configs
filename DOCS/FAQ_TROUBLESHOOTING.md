# FAQ e Troubleshooting

## 🔧 Problemas Comuns e Soluções

### Problema: Botões não aparecem no header

**Sintomas:**
- Clica em uma configuração, nenhum botão aparece
- Console não mostra logs

**Soluções:**

1. **Verificar inicialização de HeaderControls**
   ```javascript
   // Abrir Console (F12) e executar:
   console.log(headerControls);
   // Deve mostrar: HeaderControls { initialized: true, ... }
   ```

2. **Verificar se setActiveView foi chamado**
   ```javascript
   // Console deve mostrar:
   [setActiveView] Chamado com viewKey: adjacent:ain
   [setActiveView] headerControls existe? true
   [setActiveView] isAdjacent: true
   [setActiveView] Mostrando botões para: AIN (Analógico)
   ```

3. **Verificar CSS do container**
   ```javascript
   // No Console, executar:
   let container = document.getElementById('topbarActions');
   console.log(container.className); // Deve conter: 'active'
   console.log(getComputedStyle(container).display); // Deve ser: 'flex'
   ```

4. **Recarregar com cache limpo**
   - Testar com `Ctrl+Shift+R` (reload duro)
   - Ou abrir DevTools → Settings → Disable cache (quando aberto)

---

### Problema: Mudanças não são detectadas (sem ponto amarelo)

**Sintomas:**
- Modifica campo, nenhum indicador aparece
- Botão "Aplicar" não funciona

**Soluções:**

1. **Verificar se track-changes.js está incluído**
   ```html
   <!-- Deve estar no final de CADA index.html adjacente -->
   <script src="../../js/track-changes.js"></script>
   ```

2. **Verificar tipo de elemento**
   ```javascript
   // track-changes.js só funciona com:
   // - <input type="...">
   // - <select>
   // - <textarea>
   
   // ❌ NÃO funciona com:
   // - <button>
   // - <div> contenteditable
   // - Custom elements
   ```

3. **Testar disparo manual de evento**
   ```javascript
   // No Console, dentro da iframe:
   let input = document.querySelector('input');
   input.dispatchEvent(new Event('input', { bubbles: true }));
   // Deve mostrar no parent: 
   window.parent.headerControls.markDirty(); // ← Se funcionou
   ```

4. **Verificar se parent está acessível**
   ```javascript
   // Em qualquer iframe, testar:
   console.log(window.parent.headerControls);
   // Se undefined, há problema de comunicação
   ```

---

### Problema: Botão "Aplicar" não faz nada

**Sintomas:**
- Clica no botão, nada acontece
- Console mostra erro "applyConfig not a function"

**Soluções:**

1. **Verificar se funções existem na iframe**
   ```javascript
   // No Console dentro da iframe:
   console.log(typeof loadConfig);  // Deve ser: 'function'
   console.log(typeof applyConfig); // Deve ser: 'function'
   ```

2. **Verificar seletor da iframe em app.js**
   ```javascript
   // Executar no Console (página principal):
   let iframe = document.querySelector('[id="view-adjacent-ain"] iframe.adjacent-frame');
   console.log(iframe); // Deve mostrar: <iframe>
   console.log(iframe?.contentWindow?.applyConfig);
   // Se undefined, o seletor está errado
   ```

3. **Verificar se applyConfig retorna true/false**
   ```javascript
   // Em seu index.js, função DEVE retornar boolean:
   async function applyConfig() {
     try {
       // ... seu código ...
       return true;  // ✅ CORRETO
     } catch (e) {
       return false; // ✅ CORRETO
     }
   }
   // ❌ ERRADO: não retornar nada
   ```

4. **Adicionar logs de debug**
   ```javascript
   // Modifique app.js temporariamente:
   headerControls.onApply(() => {
     console.log('DEBUG: onApply callback chamado');
     const iframe = document.querySelector(`[id="view-adjacent-${configId}"] iframe`);
     console.log('DEBUG: iframe encontrada?', !!iframe);
     console.log('DEBUG: applyConfig existe?', !!iframe?.contentWindow?.applyConfig);
     return iframe.contentWindow.applyConfig?.();
   });
   ```

---

### Problema: Estilos não aplicam / Layout quebrado

**Sintomas:**
- Elementos com cores estranhas
- Layout não responsivo
- Botões com tamanho errado

**Soluções:**

1. **Verificar conflito de classes CSS**
   ```css
   /* ❌ NUNCA faça em style.css do adjacente: */
   .btn-primary { 
     background: red !important; /* Quebra todas as configs */
   }
   
   /* ✅ FAÇA assim: */
   .minha-config .btn-primary {
     background: var(--primary-color);
   }
   ```

2. **Verificar especificidade CSS**
   ```javascript
   // No Console, verificar estilos aplicados:
   let element = document.querySelector('.adjacent-card');
   console.log(getComputedStyle(element));
   // Procurar pela propriedade afetada
   ```

3. **Usar variáveis CSS corretas**
   ```css
   /* ✅ CORRETO - usa variáveis do tema */
   .meu-elemento {
     background: var(--surface);
     color: var(--text);
     border: 1px solid var(--border);
   }
   
   /* ❌ ERRADO - cores hardcoded */
   .meu-elemento {
     background: #1a1a2e;
     color: #fff;
     border: 1px solid gray;
   }
   ```

4. **Limpar cache CSS**
   - DevTools → Application → Cache Storage → Limpar
   - Ou usar `Ctrl+Shift+R`

---

### Problema: API retorna erro "undefined is not a function"

**Sintomas:**
- Erro no console ao clicar em "Aplicar"
- Backend não recebe dados

**Soluções:**

1. **Verificar endpoint da API existe**
   ```javascript
   // Verificar em backend.py se a função existe:
   @app.route('/api/get_config')  # ou pywebview api
   def get_config():
       return {'ok': True}
   ```

2. **Chamar corretamente a API**
   ```javascript
   // ✅ CORRETO - pywebview
   const result = await window.pywebview.api.get_dados();
   
   // ✅ CORRETO - fetch
   const result = await fetch('/api/get_dados').then(r => r.json());
   
   // ❌ ERRADO - função fantasia
   const result = await window.pywebview.api.my_fake_function();
   ```

3. **Verificar tipo de retorno esperado**
   ```javascript
   // Esperado: { ok: true, data: {...} }
   // ou:       { ok: false, error: "mensagem" }
   
   async function applyConfig() {
     const response = await window.pywebview.api.set_config(data);
     
     if (!response) {
       console.error('API retornou null/undefined');
       return false;
     }
     
     if (response.ok) {
       return true;
     } else {
       console.error('Erro da API:', response.error);
       return false;
     }
   }
   ```

---

### Problema: Página fica toda branca / erro 500

**Sintomas:**
- Página em branco após clicar em config
- Console mostra erro CORS ou 500

**Soluções:**

1. **Verificar console do backend**
   ```bash
   # Terminal Python - procurar por:
   ERROR
   Traceback
   Exception
   ```

2. **Verificar Network (F12 → Network)**
   - Abrir DevTools → Network
   - Clicar em configuração
   - Procurar requisições falhadas (status 500, 404)
   - Clicar na requisição para ver resposta completa

3. **Verificar permissões de arquivo**
   ```bash
   # Se arquivo não encontrado (404):
   ls web/configuracoes-adjacentes/ain/index.html
   # Deve existir
   ```

4. **Verificar CORS headers**
   ```python
   # Em backend.py, garantir:
   from flask_cors import CORS
   CORS(app)
   ```

---

### Problema: Indicador amarelo fica piscando (buggy)

**Sintomas:**
- Ponto amarelo aparece/desaparece aleatoriamente
- Comportamento errático

**Soluções:**

1. **Evitar chamar markDirty múltiplas vezes**
   ```javascript
   // ✅ CORRETO - verificar antes
   function markDirty() {
     if (this.isDirty) return; // Já está dirty
     this.isDirty = true;
     // ... mostrar indicador
   }
   
   // ❌ ERRADO - chamar sempre
   input.addEventListener('input', () => {
     this.markDirty(); // Chamado a cada keystroke
   });
   ```

2. **track-changes.js já evita isso**
   ```javascript
   // Em track-changes.js já existe:
   input.addEventListener('change', () => headerControls.markDirty());
   input.addEventListener('input', () => headerControls.markDirty());
   // markDirty() já tem guard: if (this.isDirty) return;
   ```

3. **Se continuar buggy, desabilitar auto-track temporariamente**
   ```javascript
   // Comentar track-changes em sua iframe:
   // <script src="../../js/track-changes.js"></script>
   
   // Chamar manualmente:
   input.addEventListener('change', () => {
     window.parent.headerControls.markDirty();
   });
   ```

---

## 📊 Verificações de Debug

### Checklist de Debug - Ordem Recomendada

1. **Abrir Console (F12)**
   ```
   Procurar por erros em vermelho
   ```

2. **Procurar por logs de inicialização**
   ```
   [HEADER-CONTROLS.JS] Arquivo carregado
   [App] HeaderControls inicializado
   ```

3. **Clicar em uma configuração e procurar**
   ```
   [setActiveView] Chamado com viewKey: adjacent:xxx
   [setActiveView] Mostrando botões para: XXX
   [HeaderControls] Botões mostrados para: xxx
   ```

4. **Modificar um campo**
   ```
   Deve aparecer ponto amarelo
   Console filtrando por [HeaderControls]:
   [HeaderControls] Marcado como dirty
   ```

5. **Clicar em "Aplicar"**
   ```
   Console procurando por:
   [setActiveView] onApply chamado
   [setActiveView] iframe encontrada? true
   [setActiveView] Chamando applyConfig...
   ```

### Snippets Úteis para Console

```javascript
// Verificar estado do HeaderControls
console.table({
  'Inicializado?': headerControls.initialized,
  'Config Atual': headerControls.currentConfig,
  'Dirty?': headerControls.isDirty,
  'Tem Container?': !!headerControls.actionsContainer
});

// Verificar todas as iframes
document.querySelectorAll('iframe').forEach((iframe, i) => {
  console.log(`Iframe ${i}:`, {
    id: iframe.id,
    src: iframe.src,
    temApplyConfig: !!iframe.contentWindow?.applyConfig,
    temLoadConfig: !!iframe.contentWindow?.loadConfig
  });
});

// Forçar markDirty (debug)
window.headerControls?.markDirty?.();

// Forçar markClean
window.headerControls?.markClean?.();

// Listar todas as funções globais
Object.keys(window).filter(k => typeof window[k] === 'function').slice(0, 20);
```

---

## 🎯 Testes Manuais Recomendados

### Teste 1: Carregamento Inicial
```
1. Recarregar página (Ctrl+Shift+R)
2. Abrir Console
3. Procurar: "[App] HeaderControls inicializado"
4. Verificar: Sem erros em vermelho
```

### Teste 2: Navegação Entre Configs
```
1. Clicar em "AIN"
2. Verificar se botões aparecem no header
3. Clicar em "DIN"
4. Verificar se título e botões atualizaram
5. Clicar em "Painel"
6. Verificar se botões desapareceram
```

### Teste 3: Detecção de Mudanças
```
1. Estar em uma config (ex: AIN)
2. Modificar um campo
3. Verificar se ponto amarelo aparece
4. Recarregar página
5. Ponto amarelo deve estar em todos os campos se ainda dirty
```

### Teste 4: Salvar Modificações
```
1. Modificar um campo
2. Ver ponto amarelo
3. Clicar "Aplicar"
4. Esperar resposta da API
5. Verificar se ponto amarelo desapareceu
6. Recarregar página
7. Verificar se mudança foi persistida
```

### Teste 5: Atualizar
```
1. Modificar campo
2. Clicar "Atualizar"
3. Campo deve voltar ao valor original
4. Ponto amarelo deve desaparecer
```

---

## 📚 Referências de Código

### Estrutura de Erro da API
```javascript
// Sucesso
{ ok: true, data: {...} }

// Erro
{ ok: false, error: "descrição do erro" }

// Ambos devem ser tratados:
const response = await api.chamada();
if (!response?.ok) {
  console.error('Erro:', response?.error || 'Desconhecido');
  return false;
}
return true;
```

### Estrutura de Config Adjacente
```javascript
// Mínimo necessário:
async function loadConfig() { /* ... */ }
async function applyConfig() { /* ... */ }

// Recomendado:
function validateData(data) { /* ... */ }
function updateUI() { /* ... */ }
async function loadConfig() { /* ... */ }
async function applyConfig() { /* ... */ }
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});
```

### Estrutura de Callbacks
```javascript
// Em app.js, ao ativar config:
headerControls.onApply(async () => {
  const result = await iframe.contentWindow.applyConfig?.();
  return result === true;
});

headerControls.onRefresh(async () => {
  const result = await iframe.contentWindow.loadConfig?.();
  return result === true;
});

// IMPORTANTE: Ambas devem retornar true/false
```

---

## 🚨 Erros Comuns

| Erro | Causa | Solução |
|------|-------|--------|
| `Cannot read property 'showActionsFor' of undefined` | `headerControls` não foi inicializado | Verificar `DOMContentLoaded` em app.js |
| `applyConfig is not a function` | Função não existe na iframe | Definir `async function applyConfig()` em index.js |
| `Cannot access iframe.contentWindow` | iframe ainda carregando | Usar `?.` optional chaining |
| `markDirty is not a function` | track-changes.js não carregado | Incluir `<script src="../../js/track-changes.js">` |
| CORS error | Backend sem CORS headers | Adicionar `CORS(app)` em backend.py |
| Página em branco | Erro no HTML/JS | Verificar console do backend (terminal Python) |
| Estilos não aplicam | Conflito CSS | Usar classe pai/específica em style.css |
| Indicador fica piscando | markDirty chamado demais | Usar `if (this.isDirty) return;` |

