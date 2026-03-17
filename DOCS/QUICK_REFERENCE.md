# Quick Reference - Guia Rápido

## 🚀 Começo Rápido

### Estrutura Mínima de Uma Nova Config

```
web/configuracoes-adjacentes/minha-config/
├── index.html
├── index.js
└── style.css
```

### index.html Mínimo
```html
<!doctype html>
<html lang="pt-br">
<head>
  <link rel="stylesheet" href="../../css/theme.css" />
  <link rel="stylesheet" href="style.css" />
</head>
<body class="theme-blue">
  <div class="adjacent-page">
    <div class="adjacent-card">
      <div class="adjacent-section">
        <div class="adjacent-label">Meu Primeiro Campo</div>
        <input id="myInput" type="text" class="adjacent-input" />
      </div>
    </div>
  </div>
  <script src="index.js"></script>
  <script src="../../js/track-changes.js"></script>
</body>
</html>
```

### index.js Mínimo
```javascript
async function loadConfig() {
  try {
    // Carregar dados
    const data = await window.pywebview.api.get_meu_config();
    if (data?.ok) {
      document.getElementById('myInput').value = data.data?.value || '';
    }
  } catch (e) { console.error(e); }
}

async function applyConfig() {
  try {
    // Enviar dados
    const value = document.getElementById('myInput').value;
    const result = await window.pywebview.api.set_meu_config(value);
    return result?.ok ?? false;
  } catch (e) { console.error(e); return false; }
}

document.addEventListener('DOMContentLoaded', () => loadConfig());
```

### style.css Mínimo
```css
/* Estilos locais apenas */
.adjacent-card { margin-bottom: 12px; }
```

---

## 📝 Comandos Console Mais Usados

```javascript
// Verificar estado
console.log(headerControls.isDirty);
console.log(headerControls.currentConfig);

// Forçar ações
window.headerControls?.markDirty?.();
window.headerControls?.markClean?.();

// Testar seletor de iframe
document.querySelector('[id="view-adjacent-ain"]');

// Ver erros de API
window.pywebview.api.minha_funcao().catch(e => console.error(e));

// Listar variáveis CSS
getComputedStyle(document.body);
```

---

## 🎨 Classes CSS Disponíveis

| Classe | Uso |
|--------|-----|
| `.adjacent-page` | Container principal da config |
| `.adjacent-card` | Bloco de conteúdo |
| `.adjacent-section` | Seção dentro do card |
| `.adjacent-label` | Rótulo de campo |
| `.adjacent-input` | Input padrão |
| `.adjacent-row` | Linha com flex |
| `.adjacent-hint` | Texto secundário pequeno |
| `.toggle-switch` | Switch on/off |
| `.btn-primary-sm` | Botão pequeno primário |
| `.btn-outline` | Botão outline |

---

## 🔗 Variáveis CSS do Tema

```css
/* Cores */
--primary-color: #007bff
--text: #ffffff
--text-secondary: #b0b0b0
--background: #1a1a2e
--surface: #16213e
--border: #0f3460
--input-bg: #0f1d32

/* Use sempre: */
color: var(--text);
background: var(--surface);
border: 1px solid var(--border);
```

---

## ✅ Checklist - Antes de Commitar

- [ ] Sem `display: none` inline em HTML
- [ ] Sem títulos no HTML
- [ ] Sem botões de ação no HTML
- [ ] HTML começa com `<div class="adjacent-page">`
- [ ] JavaScript tem `loadConfig()` e `applyConfig()`
- [ ] Funções retornam `true` / `false`
- [ ] `track-changes.js` incluído no final do body
- [ ] CSS usa variáveis do tema
- [ ] Console sem erros ao clicar em config
- [ ] Botões do header funcionam
- [ ] Ponto amarelo aparece ao modificar
- [ ] Backend API endpoints implementados

---

## 🐛 Top 3 Erros Mais Comuns

### 1. Não retornar boolean em applyConfig
```javascript
// ❌ ERRADO
async function applyConfig() {
  await api.save();  // Sem return
}

// ✅ CORRETO
async function applyConfig() {
  const result = await api.save();
  return result.ok;  // Retorna boolean
}
```

### 2. Esquecer track-changes.js
```html
<!-- ❌ ERRADO - Sem track-changes -->
<script src="index.js"></script>

<!-- ✅ CORRETO -->
<script src="index.js"></script>
<script src="../../js/track-changes.js"></script>
```

### 3. Chamar CSS global
```javascript
// ❌ ERRADO - Quebra todas as configs
.adjacent-card { background: red !important; }

// ✅ CORRETO - Usar classe local
.minha-config-card { background: var(--surface); }
```

---

## 🔍 Debugging Rápido

### Página toda branca?
```
1. F12 → Console
2. Procurar erros em vermelho
3. Verificar terminal Python
```

### Botões não aparecem?
```javascript
// Console:
console.log(document.getElementById('topbarActions').className);
// Deve conter 'active'
```

### Mudanças não salvam?
```javascript
// Console (dentro da iframe):
console.log(typeof applyConfig);  // Deve ser 'function'
console.log(typeof loadConfig);   // Deve ser 'function'
```

### Indicador amarelo não aparece?
```javascript
// Console (dentro da iframe):
console.log(window.parent.headerControls); // Não deve ser undefined
```

---

## 📦 Estrutura Completa de Uma Config Real

```
web/configuracoes-adjacentes/exemplo/
├── index.html          ← Layout visual
├── index.js            ← Lógica (loadConfig, applyConfig)
├── style.css           ← Estilos locais
└── [assets/]           ← Imagens, ícones locais (opcional)

Regras:
✅ Pode: HTML, CSS, JS local + referências ao CSS global
❌ Não pode: Título, botões de ação, mudar CSS global
```

---

## 🔌 Conectar com Backend

### Python/Flask (backend.py)
```python
@app.route('/api/get_config_data')
def get_config():
    data = fetch_from_device()  # Do firmware
    return {'ok': True, 'data': data}

@app.route('/api/set_config', methods=['POST'])
def set_config():
    data = request.json
    success = send_to_device(data)  # Para firmware
    return {'ok': success}
```

### JavaScript (index.js da config)
```javascript
// Chamar API
const response = await window.pywebview.api.get_config_data();
if (response?.ok) {
  console.log(response.data);  // Dados do firmware
}

// Enviar dados
const result = await window.pywebview.api.set_config({ value: 123 });
if (result?.ok) {
  console.log('Salvo com sucesso!');
}
```

---

## 🎯 Fluxo Completo de Uma Interação

```
1. Usuário clica em "AIN" na árvore
   ↓
2. setActiveView("adjacent:ain") é chamado
   ↓
3. headerControls.showActionsFor('ain', 'AIN') mostra botões
   ↓
4. loadConfig() é chamado (automaticamente)
   ↓
5. API backend busca dados do firmware
   ↓
6. UI é atualizada com dados
   ↓
7. Usuário modifica um campo
   ↓
8. Event listener (change/input) dispara
   ↓
9. track-changes.js chama markDirty()
   ↓
10. Indicador amarelo aparece
   ↓
11. Usuário clica "Aplicar"
   ↓
12. applyConfig() é chamado
   ↓
13. Dados coletados e validados
   ↓
14. API backend envia para firmware
   ↓
15. markClean() limpa indicador
    ↓
16. Sucesso!
```

---

## 📱 Responsividade

Use grid/flex para telas pequenas:

```css
.meu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

@media (max-width: 768px) {
  .meu-grid {
    grid-template-columns: 1fr;
  }
}
```

---

## 🎤 Como Pedir Ajuda

**Incluir sempre:**
1. Screenshot do erro
2. Logs do Console (F12)
3. Logs do terminal Python
4. Qual aba/config está afetada
5. Passos para reproduzir

**Exemplo:**
```
"Ao clicar em AIN e modificar um campo, o ponto amarelo não aparece.

Console mostra:
[HeaderControls] Botões mostrados para: AIN (Analógico)

Mas não mostra:
[HeaderControls] Marcado como dirty

Arquivo: web/configuracoes-adjacentes/ain/index.html
Passos: 1. Clicar em AIN, 2. Modificar campo, 3. Nada acontece
"
```

---

## 📖 Documentos Relacionados

- **ARQUITETURA.md** - Documentação completa da estrutura
- **EXEMPLOS_PRATICOS.md** - Exemplos reais de componentes
- **FAQ_TROUBLESHOOTING.md** - Problemas e soluções
- **README.md** - Documentação geral do projeto

---

## 🎓 Aprenda Mais

### Vanilla JavaScript
- Event listeners: `addEventListener('change', callback)`
- Async/await: `async function`, `await`, `try/catch`
- Seletor DOM: `document.querySelector()`, `getElementById()`

### HTML Semântico
- Use tags corretas: `<label>`, `<fieldset>`, `<input>`
- Acessibilidade: `aria-label`, `aria-describedby`

### CSS Moderno
- Variáveis: `var(--nome-cor)`
- Grid/Flex: `display: grid`, `display: flex`
- Media queries: `@media (max-width: 768px)`

---

## ⚡ Performance Tips

1. **Debounce para validação**
   ```javascript
   let timeout;
   input.addEventListener('input', () => {
     clearTimeout(timeout);
     timeout = setTimeout(() => validate(), 300);
   });
   ```

2. **Lazy load de dados grandes**
   ```javascript
   async function loadConfig() {
     // Carregar importantes primeiro
     await loadCriticalData();
     // Depois carregar o resto
     await loadExtraData();
   }
   ```

3. **Cancelar requisições antigas**
   ```javascript
   let controller = new AbortController();
   
   async function loadConfig() {
     controller.abort();  // Cancelar anterior
     controller = new AbortController();
     fetch(url, { signal: controller.signal });
   }
   ```

---

## 🚨 Não Faça

```javascript
// ❌ Never - vai quebrar tudo
document.body.innerHTML = '';
window.location.href = 'https://outro-site.com';
eval(userInput);

// ❌ Bad practice
for (let i = 0; i < 1000000; i++) document.createElement('div');
setInterval(() => heavyComputation(), 10);

// ❌ Antipattern
var global_variable = 123;  // Use const/let
function = (x) => x + 1;    // Nomes confusos
```

---

## ✨ Best Practices

```javascript
// ✅ DO
const myValue = getUserInput();
const isValid = validateData(myValue);
if (isValid) {
  await saveData(myValue);
}

// ✅ DO - Error handling
try {
  const data = await api.fetch();
  return data;
} catch (error) {
  console.error('Erro:', error);
  return null;
}

// ✅ DO - Naming
const userEmail = getUserEmail();
const isEnabled = checkIfEnabled();
const MAX_RETRIES = 3;
```

---

## 📞 Support

Para dúvidas sobre a estrutura, revisar:
1. Este arquivo (Quick Reference)
2. **ARQUITETURA.md** (Detalhes)
3. **EXEMPLOS_PRATICOS.md** (Código real)
4. **FAQ_TROUBLESHOOTING.md** (Problemas)

