# Guia Prático - Exemplos de Implementação

## 📚 Índice
1. [Exemplo 1: Input Simples](#exemplo-1-input-simples)
2. [Exemplo 2: Toggle Switch](#exemplo-2-toggle-switch)
3. [Exemplo 3: Range Slider](#exemplo-3-range-slider)
4. [Exemplo 4: Grid de Itens](#exemplo-4-grid-de-itens)
5. [Exemplo 5: Validação Complexa](#exemplo-5-validação-complexa)
6. [Exemplo 6: Estados Carregando](#exemplo-6-estados-carregando)

---

## Exemplo 1: Input Simples

### HTML
```html
<div class="adjacent-card">
  <div class="adjacent-section">
    <div class="adjacent-label">Ganho (Gain)</div>
    <input 
      id="gainInput" 
      type="number" 
      min="0" 
      max="100" 
      step="1"
      class="adjacent-input"
    />
    <span class="adjacent-hint" id="gainHint">--</span>
  </div>
</div>
```

### JavaScript
```javascript
async function loadConfig() {
  try {
    const response = await window.pywebview.api.get_gain_config();
    if (response?.ok) {
      const gain = response.data?.gain || 0;
      document.getElementById('gainInput').value = gain;
      updateGainHint(gain);
      
      // Marcar como não modificado
      window.parent.headerControls?.markClean?.();
    }
  } catch (error) {
    console.error('[Config] Erro ao carregar:', error);
  }
}

async function applyConfig() {
  try {
    const gain = parseInt(document.getElementById('gainInput').value);
    
    // Validar
    if (isNaN(gain) || gain < 0 || gain > 100) {
      console.error('[Config] Ganho inválido');
      return false;
    }
    
    // Aplicar
    const response = await window.pywebview.api.set_gain(gain);
    return response?.ok ?? false;
  } catch (error) {
    console.error('[Config] Erro ao aplicar:', error);
    return false;
  }
}

function updateGainHint(value) {
  document.getElementById('gainHint').textContent = `${value}%`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  document.getElementById('gainInput')
    ?.addEventListener('input', (e) => updateGainHint(e.target.value));
});
```

### CSS
```css
.adjacent-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--input-bg);
  color: var(--text);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.adjacent-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

.adjacent-hint {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
```

---

## Exemplo 2: Toggle Switch

### HTML
```html
<div class="adjacent-card">
  <div class="adjacent-row">
    <div class="adjacent-label">Habilitar Force Feedback</div>
    <label class="toggle-switch">
      <input id="ffbToggle" type="checkbox" />
      <span class="toggle-slider"></span>
    </label>
  </div>
  <div class="adjacent-row">
    <span class="adjacent-hint" id="ffbStatus">Desabilitado</span>
  </div>
</div>
```

### JavaScript
```javascript
async function loadConfig() {
  try {
    const response = await window.pywebview.api.get_ffb_status();
    if (response?.ok) {
      const enabled = response.data?.enabled ?? false;
      document.getElementById('ffbToggle').checked = enabled;
      updateFFBStatus(enabled);
    }
  } catch (error) {
    console.error('[FFB] Erro:', error);
  }
}

async function applyConfig() {
  try {
    const enabled = document.getElementById('ffbToggle').checked;
    const response = await window.pywebview.api.set_ffb_enabled(enabled);
    return response?.ok ?? false;
  } catch (error) {
    console.error('[FFB] Erro ao aplicar:', error);
    return false;
  }
}

function updateFFBStatus(enabled) {
  document.getElementById('ffbStatus').textContent = 
    enabled ? '✓ Habilitado' : '✗ Desabilitado';
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  document.getElementById('ffbToggle')
    ?.addEventListener('change', (e) => updateFFBStatus(e.target.checked));
});
```

### CSS (Já existe em theme.css)
```css
.toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.toggle-slider {
  width: 44px;
  height: 24px;
  background: #444;
  border-radius: 12px;
  position: relative;
  transition: background 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: left 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--primary-color);
}

.toggle-switch input:checked + .toggle-slider::before {
  left: 22px;
}
```

---

## Exemplo 3: Range Slider

### HTML
```html
<div class="adjacent-card">
  <div class="adjacent-section">
    <div class="adjacent-label">
      Velocidade
      <span class="adjacent-value" id="speedValue">50</span>
    </div>
    <input 
      id="speedSlider"
      type="range"
      min="0"
      max="100"
      step="1"
      class="range-slider"
    />
    <div class="range-labels">
      <span>Lento</span>
      <span>Rápido</span>
    </div>
  </div>
</div>
```

### JavaScript
```javascript
async function loadConfig() {
  try {
    const response = await window.pywebview.api.get_speed_config();
    if (response?.ok) {
      const speed = response.data?.speed ?? 50;
      document.getElementById('speedSlider').value = speed;
      updateSpeedDisplay(speed);
    }
  } catch (error) {
    console.error('[Speed] Erro:', error);
  }
}

async function applyConfig() {
  try {
    const speed = parseInt(document.getElementById('speedSlider').value);
    const response = await window.pywebview.api.set_speed(speed);
    return response?.ok ?? false;
  } catch (error) {
    console.error('[Speed] Erro:', error);
    return false;
  }
}

function updateSpeedDisplay(value) {
  document.getElementById('speedValue').textContent = value;
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  document.getElementById('speedSlider')
    ?.addEventListener('input', (e) => updateSpeedDisplay(e.target.value));
});
```

### CSS
```css
.range-slider {
  width: 100%;
  height: 6px;
  background: linear-gradient(
    to right,
    var(--primary-color) 0%,
    var(--primary-color) var(--value),
    var(--input-border) var(--value),
    var(--input-border) 100%
  );
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--primary-color);
  cursor: pointer;
  border-radius: 50%;
  box-shadow: var(--shadow);
  transition: box-shadow 0.2s;
}

.range-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 8px rgba(0, 123, 255, 0.2);
}

.range-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: var(--primary-color);
  cursor: pointer;
  border-radius: 50%;
  border: none;
  box-shadow: var(--shadow);
}

.adjacent-value {
  font-weight: bold;
  color: var(--primary-color);
  margin-left: 8px;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
```

---

## Exemplo 4: Grid de Itens

### HTML
```html
<div class="adjacent-card">
  <div class="adjacent-section">
    <div class="adjacent-label">Canais Habilitados</div>
    <div id="channelGrid" class="channel-grid">
      <!-- Gerado por JavaScript -->
    </div>
    <div class="adjacent-hint" id="channelCount">0 canais selecionados</div>
  </div>
</div>
```

### JavaScript
```javascript
const MAX_CHANNELS = 8;

async function loadConfig() {
  try {
    const response = await window.pywebview.api.get_channels_config();
    if (response?.ok) {
      const channels = response.data?.channels ?? [];
      renderChannelGrid(channels);
    }
  } catch (error) {
    console.error('[Channels] Erro:', error);
  }
}

function renderChannelGrid(enabledChannels) {
  const grid = document.getElementById('channelGrid');
  grid.innerHTML = '';
  
  for (let i = 0; i < MAX_CHANNELS; i++) {
    const isEnabled = enabledChannels.includes(i);
    const checkbox = document.createElement('label');
    checkbox.className = 'channel-checkbox';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = isEnabled;
    input.addEventListener('change', updateChannelCount);
    
    const label = document.createElement('span');
    label.textContent = `Ch${i + 1}`;
    
    checkbox.appendChild(input);
    checkbox.appendChild(label);
    grid.appendChild(checkbox);
  }
}

function updateChannelCount() {
  const checked = Array.from(
    document.querySelectorAll('[id="channelGrid"] input:checked')
  ).length;
  
  document.getElementById('channelCount')
    .textContent = `${checked} canal${checked !== 1 ? 'is' : ''} selecionado${checked !== 1 ? 's' : ''}`;
}

async function applyConfig() {
  try {
    const channels = Array.from(
      document.querySelectorAll('[id="channelGrid"] input:checked')
    ).map((cb) => parseInt(cb.parentElement.getAttribute('data-channel')));
    
    const response = await window.pywebview.api.set_channels(channels);
    return response?.ok ?? false;
  } catch (error) {
    console.error('[Channels] Erro:', error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});
```

### CSS
```css
.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.channel-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.channel-checkbox:hover {
  border-color: var(--primary-color);
}

.channel-checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.channel-checkbox input:checked + span {
  color: var(--success-color);
  font-weight: bold;
}
```

---

## Exemplo 5: Validação Complexa

### HTML
```html
<div class="adjacent-card">
  <div class="adjacent-section">
    <div class="adjacent-label">Limites (Min / Max)</div>
    <div class="limit-inputs">
      <div>
        <label>Mínimo</label>
        <input id="minInput" type="number" />
      </div>
      <div>
        <label>Máximo</label>
        <input id="maxInput" type="number" />
      </div>
    </div>
    <div class="adjacent-hint" id="limitError"></div>
  </div>
</div>
```

### JavaScript
```javascript
const LIMITS = {
  MIN: 0,
  MAX: 1000,
  MIN_RANGE: 10  // Diferença mínima entre min e max
};

async function loadConfig() {
  try {
    const response = await window.pywebview.api.get_limits();
    if (response?.ok) {
      const { min, max } = response.data ?? {};
      document.getElementById('minInput').value = min ?? LIMITS.MIN;
      document.getElementById('maxInput').value = max ?? LIMITS.MAX;
      validateLimits();
    }
  } catch (error) {
    console.error('[Limits] Erro:', error);
  }
}

function validateLimits() {
  const minInput = document.getElementById('minInput');
  const maxInput = document.getElementById('maxInput');
  const errorDiv = document.getElementById('limitError');
  
  const min = parseInt(minInput.value) || LIMITS.MIN;
  const max = parseInt(maxInput.value) || LIMITS.MAX;
  
  let errors = [];
  
  // Validação 1: Min e Max não podem sair do range
  if (min < LIMITS.MIN) errors.push(`Mínimo deve ser ≥ ${LIMITS.MIN}`);
  if (max > LIMITS.MAX) errors.push(`Máximo deve ser ≤ ${LIMITS.MAX}`);
  
  // Validação 2: Min não pode ser maior que Max
  if (min > max) errors.push('Mínimo deve ser menor que Máximo');
  
  // Validação 3: Diferença mínima
  if ((max - min) < LIMITS.MIN_RANGE) 
    errors.push(`Diferença mínima: ${LIMITS.MIN_RANGE}`);
  
  // Mostrar erros
  if (errors.length > 0) {
    errorDiv.textContent = errors.join(' | ');
    errorDiv.style.color = 'var(--danger-color)';
    return false;
  } else {
    errorDiv.textContent = '✓ Válido';
    errorDiv.style.color = 'var(--success-color)';
    return true;
  }
}

async function applyConfig() {
  try {
    if (!validateLimits()) {
      console.error('[Limits] Validação falhou');
      return false;
    }
    
    const min = parseInt(document.getElementById('minInput').value);
    const max = parseInt(document.getElementById('maxInput').value);
    
    const response = await window.pywebview.api.set_limits(min, max);
    return response?.ok ?? false;
  } catch (error) {
    console.error('[Limits] Erro:', error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  document.getElementById('minInput')?.addEventListener('change', validateLimits);
  document.getElementById('maxInput')?.addEventListener('change', validateLimits);
});
```

### CSS
```css
.limit-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 8px;
}

.limit-inputs > div {
  display: flex;
  flex-direction: column;
}

.limit-inputs label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
  font-weight: 500;
}

.limit-inputs input {
  padding: 8px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  color: var(--text);
}
```

---

## Exemplo 6: Estados Carregando

### HTML
```html
<div class="adjacent-card">
  <div class="adjacent-section">
    <div class="adjacent-label">Status</div>
    <div id="statusContainer">
      <div class="loading">
        <span class="spinner"></span>
        <span>Carregando...</span>
      </div>
    </div>
  </div>
</div>
```

### JavaScript
```javascript
async function loadConfig() {
  try {
    showLoading();
    
    // Simulando delay
    const response = await new Promise(resolve => {
      setTimeout(() => {
        resolve({ ok: true, data: { status: 'Ativo' } });
      }, 1000);
    });
    
    if (response?.ok) {
      showContent(response.data);
    } else {
      showError('Erro ao carregar');
    }
  } catch (error) {
    showError(error.message);
  }
}

function showLoading() {
  const container = document.getElementById('statusContainer');
  container.innerHTML = `
    <div class="loading">
      <span class="spinner"></span>
      <span>Carregando...</span>
    </div>
  `;
}

function showContent(data) {
  const container = document.getElementById('statusContainer');
  container.innerHTML = `
    <div class="content">
      <span class="status-badge" data-status="active">✓ ${data.status}</span>
    </div>
  `;
}

function showError(message) {
  const container = document.getElementById('statusContainer');
  container.innerHTML = `
    <div class="error">
      <span class="status-badge" data-status="error">✗ ${message}</span>
      <button class="btn-retry">Tentar Novamente</button>
    </div>
  `;
  
  document.querySelector('.btn-retry')?.addEventListener('click', loadConfig);
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});
```

### CSS
```css
.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: rgba(0, 123, 255, 0.1);
  border-radius: 6px;
  color: var(--primary-color);
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 123, 255, 0.3);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.status-badge[data-status="active"] {
  background: rgba(40, 167, 69, 0.2);
  color: var(--success-color);
}

.status-badge[data-status="error"] {
  background: rgba(220, 53, 69, 0.2);
  color: var(--danger-color);
}

.error {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(220, 53, 69, 0.1);
  border-radius: 6px;
}

.btn-retry {
  padding: 6px 12px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.btn-retry:hover {
  background: #0056b3;
}
```

---

## Checklist de Implementação

Para cada novo componente, verifique:

- [ ] HTML usa classes corretas (`.adjacent-card`, `.adjacent-label`, etc.)
- [ ] JavaScript tem `loadConfig()` e `applyConfig()`
- [ ] Validação de dados antes de enviar
- [ ] Informações de erro mostrando para usuário
- [ ] Estados loading/error/success implementados
- [ ] Variáveis CSS usadas para cores
- [ ] CSS não usa `!important` sem motivo
- [ ] Inputs disparam eventos corretamente
- [ ] `markDirty()` é chamado automaticamente
- [ ] Teste de DevTools mostra logs corretos

