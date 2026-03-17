# Documentação de Arquitetura - DSW Pro Wheel Configurator

## 📋 Índice
1. [Visão Geral](#visão-geral)
2. [Estrutura de Diretórios](#estrutura-de-diretórios)
3. [Componentes Principais](#componentes-principais)
4. [Sistema de Configurações Adjacentes](#sistema-de-configurações-adjacentes)
5. [Regras e Padrões](#regras-e-padrões)
6. [Como Adicionar uma Nova Configuração](#como-adicionar-uma-nova-configuração)
7. [API de Botões do Header](#api-de-botões-do-header)

---

## Visão Geral

O **DSW Pro Wheel Configurator** é uma aplicação de configuração de hardware para volantes de corrida. A interface é construída com:

- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Backend**: Python + PyWebView
- **Padrão**: SPA (Single Page Application) com iframes para configurações isoladas

### Arquitetura de Visualizações

```
┌─────────────────────────────────────────┐
│          Aplicação Principal            │
│  (index.html - app.js - theme.css)     │
├─────────────────────────────────────────┤
│  [ Painel ] [ Monitoramento ] [ Config ]│  ← Views principais
├─────────────────────────────────────────┤
│                                         │
│  Configurações Adjacentes:              │
│  ┌─────────────────────────────────┐   │
│  │  AIN | DIN | Encoder | etc.    │   │ ← Menu lateral
│  └─────────────────────────────────┘   │
│                                         │
│  ┌──────── Header com Botões ─────────┐ │
│  │ Atualizar | Aplicar | •Modificado │ │ ← Botões dinâmicos
│  └──────────────────────────────────┬─┘ │ ← HeaderControls
│                                         │
│  ┌ Frame de Configuração Ativa ─────┐  │
│  │  <iframe src="ain/index.html">    │  │
│  │    - Formulários de entrada      │  │
│  │    - Validações locais            │  │
│  └─────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Estrutura de Diretórios

```
DSW-pro-wheel-configs/
│
├── web/                                    # ← Frontend
│   ├── index.html                          # Página principal
│   ├── js/
│   │   ├── app.js                          # Controlador principal
│   │   ├── monitoring.js                   # Monitoramento em tempo real
│   │   ├── header-controls.js              # ✅ API de botões do header
│   │   └── track-changes.js                # ✅ Detector automático de mudanças
│   │
│   ├── css/
│   │   ├── theme.css                       # Estilos principais
│   │   └── *.css                           # Estilos específicos
│   │
│   ├── configuracoes-adjacentes/           # 📁 Configurações isoladas (iframes)
│   │   ├── ain/                            # Entrada Analógica
│   │   │   ├── index.html                  # HTML (SEM título, SEM botões)
│   │   │   ├── index.js                    # Lógica: loadConfig(), applyConfig()
│   │   │   ├── style.css                   # Estilos da config
│   │   │   └── [outros arquivos]
│   │   │
│   │   ├── cambio/                         # Câmbio/Shifter
│   │   │   ├── index.html
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   │
│   │   ├── din/                            # Entrada Digital
│   │   ├── encoder/                        # Encoder
│   │   ├── force-feedback/                 # Force Feedback
│   │   └── pwm/                            # PWM Driver
│   │
│   └── bootstrap-5.3.0-dist/               # Framework CSS
│       └── css/, js/
│
├── app.py                                  # ← Backend (PyWebView)
├── backend.py                              # Backend logic
├── profiles.json                           # Perfis de configuração
├── README.md                               # Documentação geral
└── ARQUITETURA.md                          # ← VOCÊ ESTÁ AQUI

```

---

## Componentes Principais

### 1. **index.html** (Página Principal)
- **Responsabilidade**: Estrutura base da aplicação
- **Contém**: Header, Menu lateral, Container de views, Footer
- **Scripts carregados**: 
  - `header-controls.js` (ANTES de app.js)
  - `app.js`
  - `monitoring.js`

### 2. **app.js** (Controlador Principal)
- **Responsabilidade**: Gerenciar views, navegação, comunicação com backend
- **Funções principais**:
  - `setActiveView(viewKey, title)` - Alterna entre views
  - `onTreeItemClick()` - Gerencia cliques na árvore de configurações
  - `refreshAll()` - Carrega todas as configurações
  - Event listeners de botões

### 3. **header-controls.js** (API de Botões) ⭐
- **Responsabilidade**: Gerenciar botões "Aplicar" e "Atualizar" no header
- **Instância global**: `headerControls`
- **Métodos principais**:
  ```javascript
  headerControls.init()                    // Inicializa
  headerControls.showActionsFor(id, title) // Mostra botões
  headerControls.hideActions()             // Esconde botões
  headerControls.markDirty()               // Marca como modificado
  headerControls.markClean()               // Marca como salvo
  headerControls.onApply(callback)         // Define ação do botão Aplicar
  headerControls.onRefresh(callback)       // Define ação do botão Atualizar
  ```

### 4. **track-changes.js** (Detector de Mudanças) ⭐
- **Responsabilidade**: Detectar automaticamente quando há mudanças
- **Funcionamento**: 
  - Intercepta eventos `change` e `input` em toda a iframe
  - Marca configuação como dirty (modificada)
  - Ativa indicador visual (ponto amarelo pulsante)

### 5. **Configurações Adjacentes** (iframes)
Cada configuração é uma iframe isolada que:
- **Carrega seu próprio HTML/CSS/JS**
- **Tem funções obrigatórias**:
  ```javascript
  loadConfig()   // Carrega dados do dispositivo
  applyConfig()  // Envia dados para dispositivo
  ```

---

## Sistema de Configurações Adjacentes

### O que é?
Configurações adjacentes são painéis independentes que aparecem como iframes dentro da aplicação principal. Cada uma gerencia um aspecto do hardware:

- **AIN** - Entrada Analógica (6 canais)
- **DIN** - Entrada Digital
- **Encoder** - Configuração de encoder
- **Câmbio** - H-Shifter / Sequential shifter
- **Force Feedback** - FFB settings
- **PWM** - Driver PWM

### Como Funciona

1. **Usuário clica em "AIN"** na árvore lateral
2. `setActiveView("adjacent:ain", "AIN")` é chamado
3. `HeaderControls` mostra os botões "Atualizar" e "Aplicar"
4. `track-changes.js` começa a monitorar mudanças na iframe
5. Quando usuário modifica algo:
   - Indicador amarelo aparece
   - `window.parent.headerControls.markDirty()` é chamado
6. Quando usuário clica "Aplicar" no header:
   - Callback chama `iframe.contentWindow.applyConfig()`
   - Mudanças são enviadas para o dispositivo
   - Indicador desaparece

---

## Regras e Padrões

### ✅ O QUE É PERMITIDO

#### Em `configuracoes-adjacentes/X/index.html`:
- ✅ Usar tags HTML semânticas: `<div>`, `<section>`, `<fieldset>`, `<label>`, `<input>`, etc.
- ✅ Usar classes CSS personalizadas do arquivo `style.css` local
- ✅ Usar classes Bootstrap se necessário
- ✅ Usar classes utilitárias de `../../css/theme.css`
- ✅ Incluir scripts próprios `index.js`
- ✅ Incluir `../../js/track-changes.js` no final do body

#### Em `configuracoes-adjacentes/X/index.js`:
- ✅ Definir funções `loadConfig()` e `applyConfig()`
- ✅ Usar `window.parent.headerControls.markDirty()` para notificar mudanças
- ✅ Fazer chamadas de API via `window.pywebview.api.xxxxx()`
- ✅ Manipular o DOM da própria iframe
- ✅ Validar dados antes de enviar

#### Em `configuracoes-adjacentes/X/style.css`:
- ✅ Estilos específicos da configuração
- ✅ Usar variáveis CSS do tema: `var(--primary-color)`, `var(--text)`, etc.
- ✅ Extend classes existentes com regras adicionais

---

### ❌ O QUE É PROIBIDO

#### NUNCA em `configuracoes-adjacentes/X/`:

❌ **Modificar classes CSS globais**
```css
/* ❌ PROIBIDO - vai quebrar todas as outras configs */
.btn-primary { background: red !important; }
.adjacent-card { padding: 100px; }
```

❌ **Remover ou mudar estrutura do HTML esperada**
```html
<!-- ❌ PROIBIDO - esperado: <div class="adjacent-page"> -->
<div id="custom-page-wrapper">
```

❌ **Adicionar títulos ou headers próprios**
```html
<!-- ❌ PROIBIDO - o título vem do header principal -->
<div class="adjacent-header">
  <h2>Meu Título</h2>
</div>
```

❌ **Adicionar botões de ação próprios**
```html
<!-- ❌ PROIBIDO - botões ficam no header principal -->
<button>Aplicar</button>
<button>Atualizar</button>
```

❌ **Poluir o escopo se não necessário**
```javascript
// ❌ PROIBIDO - não faça listeners globais desnecessários
window.addEventListener('resize', expensiveOperation);
```

❌ **Modificar arquivo app.js diretamente sem coordenar**
```javascript
// ❌ PROIBIDO - pode quebrar a lógica global
setActiveView = function() { /* versão modificada */ }
```

---

## Como Adicionar uma Nova Configuração

### Passo 1: Criar a Estrutura de Diretórios

```bash
mkdir -p web/configuracoes-adjacentes/nova-config
cd web/configuracoes-adjacentes/nova-config
```

### Passo 2: Criar `index.html`

```html
<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="../../css/theme.css" />
    <link rel="stylesheet" href="style.css" />
    <title>Nova Configuração</title>
  </head>
  <body class="theme-blue">
    <div class="adjacent-page">
      <!-- Card exemplo -->
      <div class="adjacent-card">
        <div class="adjacent-section">
          <div class="adjacent-label">Seção 1</div>
          <div>
            <label class="toggle-switch">
              <input id="myToggle" type="checkbox" />
              <span class="toggle-slider"></span>
              <span>Opção</span>
            </label>
          </div>
        </div>
      </div>
    </div>
    
    <script src="index.js"></script>
    <script src="../../js/track-changes.js"></script>
  </body>
</html>
```

### Passo 3: Criar `index.js`

```javascript
/**
 * Nova Configuração
 * Responsável por carregar e aplicar configurações
 */

// Estado local
let novaConfigData = {};

/**
 * Carrega configuração do dispositivo
 */
async function loadConfig() {
  try {
    console.log('[Nova Config] Carregando...');
    
    // Chamar API do backend
    const response = await window.pywebview.api.get_nova_config_data();
    
    if (response?.ok) {
      novaConfigData = response.data;
      updateUIFromData();
      console.log('[Nova Config] Carregado com sucesso');
    }
  } catch (error) {
    console.error('[Nova Config] Erro ao carregar:', error);
  }
}

/**
 * Aplica configuração ao dispositivo
 */
async function applyConfig() {
  try {
    console.log('[Nova Config] Aplicando...');
    
    // Coletar dados do formulário
    const formData = {
      toggle: document.getElementById('myToggle').checked,
      // ... mais campos
    };
    
    // Validar
    if (!validateData(formData)) {
      console.error('[Nova Config] Dados inválidos');
      return false;
    }
    
    // Enviar para backend
    const response = await window.pywebview.api.set_nova_config(formData);
    
    if (response?.ok) {
      console.log('[Nova Config] Aplicado com sucesso');
      return true;
    }
  } catch (error) {
    console.error('[Nova Config] Erro ao aplicar:', error);
    return false;
  }
}

/**
 * Valida dados antes de enviar
 */
function validateData(data) {
  // Implementar validações
  return true;
}

/**
 * Atualiza UI com dados carregados
 */
function updateUIFromData() {
  document.getElementById('myToggle').checked = novaConfigData.toggle || false;
}

// Inicializar quando documento carrega
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
});
```

### Passo 4: Criar `style.css`

```css
/* Estilos específicos da Nova Configuração */

.nova-config-section {
  padding: 16px;
  background: var(--surface);
  border-radius: 8px;
}

.nova-config-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text);
  font-size: 14px;
}

/* Exemplo de media query */
@media (max-width: 768px) {
  .nova-config-section {
    padding: 12px;
  }
}
```

### Passo 5: Registrar em `app.js`

Encontre o array `adjacentConfigs` em `web/js/app.js`:

```javascript
// Linha ~7 em app.js
let adjacentConfigs = [];

// Depois de: async function loadAdjacentConfigs()
// A função já carrega de um backend endpoint
// Você precisa adicionar sua config ao JSON do backend

// Arquivo: profiles.json (ou onde suas configs estão)
{
  "adjacent_configs": [
    {
      "id": "novaconfig",              // ID único (sem espaços)
      "title": "Nova Configuração",    // Título que aparece no menu
      "view": "novaconfig/index.html"  // Caminho relativo a web/configuracoes-adjacentes/
    }
  ]
}
```

### Passo 6: Atualizar Backend

Em `backend.py` (ou arquivo de API), adicione:

```python
@app.route('/api/get_nova_config_data')
def get_nova_config():
    try:
        # Chamar firmware para obter dados
        data = get_data_from_device('nova.config')
        return {'ok': True, 'data': data}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

@app.route('/api/set_nova_config', methods=['POST'])
def set_nova_config():
    try:
        data = request.json
        # Validar e enviar para dispositivo
        set_data_on_device('nova.config', data)
        return {'ok': True}
    except Exception as e:
        return {'ok': False, 'error': str(e)}
```

### Passo 7: Testar

1. Recarregar aplicação (Ctrl+Shift+R)
2. Clicar em "Nova Configuração" no menu
3. Abrir DevTools (F12)
4. Verificar logs: `[Nova Config]`
5. Testar botões Atualizar e Aplicar

---

## API de Botões do Header

### Classe: `HeaderControls`

#### Inicialização
```javascript
// Criada automaticamente no DOMContentLoaded
const headerControls = new HeaderControls();
```

#### Métodos

##### `init()`
Inicializa o HeaderControls (chamado automaticamente).
```javascript
headerControls.init();
```

##### `showActionsFor(configId, configTitle)`
Mostra os botões "Atualizar" e "Aplicar" para uma configuração.
```javascript
headerControls.showActionsFor('ain', 'AIN (Analógico)');
```

##### `hideActions()`
Esconde os botões do header.
```javascript
headerControls.hideActions();
```

##### `onApply(callback)`
Define o callback executado quando o botão "Aplicar" é clicado.
```javascript
headerControls.onApply(async () => {
  console.log('Aplicando configuração...');
  await meuFormulario.apply();
  return true; // sucesso
});
```

##### `onRefresh(callback)`
Define o callback executado quando o botão "Atualizar" é clicado.
```javascript
headerControls.onRefresh(async () => {
  console.log('Atualizando configuração...');
  await meuFormulario.load();
  return true; // sucesso
});
```

##### `markDirty()`
Marca a configuração como modificada (mostra indicador amarelo).
```javascript
window.parent.headerControls.markDirty();
// Chamado automaticamente por track-changes.js
```

##### `markClean()`
Marca a configuração como não modificada (esconde indicador).
```javascript
window.parent.headerControls.markClean();
// Chamado automaticamente após aplicar sucesso
```

#### Exemplo Completo

```javascript
// Em sua iframe (configuracoes-adjacentes/minha-config/index.js)

async function applyConfig() {
  try {
    // Obter dados
    const dados = coletarFormulario();
    
    // Validar
    if (!validar(dados)) {
      alert('Dados inválidos!');
      return false;
    }
    
    // Enviar
    const resultado = await window.pywebview.api.aplicar_config(dados);
    
    if (resultado.ok) {
      // Marcar como limpo automaticamente por HeaderControls
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erro:', error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Esta função é definida em app.js quando a config é ativada
  // headerControls.onApply(applyConfig);
});
```

---

## Variáveis CSS Disponíveis

Use essas variáveis no seu `style.css`:

```css
:root {
  /* Cores principais */
  --primary-color: #007bff;
  --secondary-color: #6c757d;
  --success-color: #28a745;
  --danger-color: #dc3545;
  --warning-color: #ffc107;
  --info-color: #17a2b8;

  /* Temas */
  --text: #ffffff;
  --text-secondary: #b0b0b0;
  --background: #1a1a2e;
  --surface: #16213e;
  --border: #0f3460;

  /* Inputs */
  --input-bg: #0f1d32;
  --input-border: #2a3f5f;

  /* Efeitos */
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  --transition: 0.3s ease;
}
```

---

## Checklist para Nova Configuração

- [ ] Diretório criado em `web/configuracoes-adjacentes/nome-config/`
- [ ] `index.html` com estrutura padrão
- [ ] `index.js` com `loadConfig()` e `applyConfig()`
- [ ] `style.css` com estilos locais
- [ ] Config registrada no backend/JSON
- [ ] API endpoints criados no backend
- [ ] Sem títulos duplicados no HTML
- [ ] Sem botões de ação duplicados
- [ ] `track-changes.js` incluído no final do body
- [ ] Variáveis CSS do tema usadas
- [ ] Console não mostra erros ao carregar
- [ ] Botões do header funcionam corretamente

---

## Troubleshooting

### Botões não aparecem
- [ ] Verificar se `headerControls` foi inicializado (Console: `[App] HeaderControls inicializado`)
- [ ] Verificar se `showActionsFor()` foi chamado
- [ ] Verificar se classe `.active` está sendo adicionada ao container

### Mudanças não são detectadas
- [ ] Verificar se `track-changes.js` está incluído na iframe
- [ ] Verificar se o elemento é `<input>`, `<select>` ou `<textarea>`
- [ ] Verificar console para erros

### Aplicar não funciona
- [ ] Verificar se `applyConfig()` existe na iframe
- [ ] Verificar se método foi registrado via `headerControls.onApply()`
- [ ] Verificar logs no console
- [ ] Verificar resposta da API no DevTools → Network

---

## Links Úteis

- 📁 [Structure de Diretórios](#estrutura-de-diretórios)
- 🔧 [API HeaderControls](#api-de-botões-do-header)
- 🚀 [Adicionar Nova Config](#como-adicionar-uma-nova-configuração)
- ✅ [Regras Permitidas](#-o-que-é-permitido)
- ❌ [Regras Proibidas](#-o-que-é-proibido)
