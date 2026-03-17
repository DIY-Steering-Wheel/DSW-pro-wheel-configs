/**
 * Header Controls API
 * Controla os botões Aplicar/Atualizar no header principal
 * Comunicação entre as configurações adjacentes e o header
 */

class HeaderControls {
  constructor() {
    this.actionsContainer = null;
    this.currentConfig = null;
    this.isDirty = false;
    this.onApplyCallback = null;
    this.onRefreshCallback = null;
    this.initialized = false;
  }

  /**
   * Inicializa quando o DOM está pronto
   */
  init() {
    if (this.initialized) return;
    
    this.actionsContainer = document.getElementById('topbarActions');
    if (!this.actionsContainer) {
      console.warn('[HeaderControls] Container #topbarActions não encontrado');
      return;
    }
    
    this.initialized = true;
    console.log('[HeaderControls] Inicializado com sucesso');
  }

  /**
   * Mostra os botões Aplicar/Atualizar para uma configuração
   */
  showActionsFor(configId, title) {
    // Inicializa se ainda não foi feito
    if (!this.initialized) {
      this.init();
    }
    
    this.currentConfig = configId;
    
    if (!this.actionsContainer) {
      console.error('[HeaderControls] Container ainda não disponível após init()');
      return;
    }
    
    // Criar container
    this.actionsContainer.innerHTML = '';
    
    // Indicador de mudanças
    const indicator = document.createElement('span');
    indicator.id = 'headerIndicator';
    indicator.className = 'topbar-change-indicator';
    indicator.style.display = 'none';
    indicator.title = 'Há alterações pendentes de aplicação';
    
    // Botão Atualizar
    const btnRefresh = document.createElement('a');
    btnRefresh.href = '#';
    btnRefresh.className = 'topbar-link topbar-link-refresh';
    btnRefresh.title = 'Atualizar configuração';
    btnRefresh.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Atualizar';
    btnRefresh.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleRefresh();
    });
    
    // Botão Aplicar
    const btnApply = document.createElement('a');
    btnApply.href = '#';
    btnApply.className = 'topbar-link topbar-link-apply';
    btnApply.id = 'headerApplyBtn';
    btnApply.title = 'Aplicar alterações';
    btnApply.appendChild(indicator);
    btnApply.appendChild(document.createTextNode(' '));
    const iconApply = document.createElement('i');
    iconApply.className = 'bi bi-check-lg';
    btnApply.appendChild(iconApply);
    btnApply.appendChild(document.createTextNode(' Aplicar'));
    btnApply.addEventListener('click', (e) => {
      e.preventDefault();
      this.handleApply();
    });
    
    // Adicionar botões
    this.actionsContainer.appendChild(btnRefresh);
    this.actionsContainer.appendChild(btnApply);
    this.actionsContainer.classList.add('active');  // Mostrar container
    
    this.indicator = indicator;
    this.btnApply = btnApply;
    
    console.log(`[HeaderControls] Botões mostrados para: ${configId}`);
  }

  /**
   * Esconde os botões
   */
  hideActions() {
    if (this.actionsContainer) {
      this.actionsContainer.classList.remove('active');  // Esconder container
      this.actionsContainer.innerHTML = '';
    }
    this.currentConfig = null;
    this.isDirty = false;
    console.log('[HeaderControls] Botões escondidos');
  }

  /**
   * Marca como tendo mudanças
   */
  markDirty() {
    if (this.isDirty) return;
    
    this.isDirty = true;
    if (this.indicator) {
      this.indicator.style.display = 'inline-block';
    }
    if (this.btnApply) {
      this.btnApply.classList.add('has-changes');
    }
    console.log('[HeaderControls] Marcado como dirty');
  }

  /**
   * Marca como limpo (sem mudanças)
   */
  markClean() {
    this.isDirty = false;
    if (this.indicator) {
      this.indicator.style.display = 'none';
    }
    if (this.btnApply) {
      this.btnApply.classList.remove('has-changes');
    }
    console.log('[HeaderControls] Marcado como clean');
  }

  /**
   * Define callback para Aplicar
   */
  onApply(callback) {
    this.onApplyCallback = callback;
    return this;
  }

  /**
   * Define callback para Atualizar
   */
  onRefresh(callback) {
    this.onRefreshCallback = callback;
    return this;
  }

  /**
   * Handler para botão Aplicar
   */
  async handleApply() {
    if (this.onApplyCallback && typeof this.onApplyCallback === 'function') {
      try {
        await this.onApplyCallback();
        this.markClean();
      } catch (error) {
        console.error('[HeaderControls] Erro ao aplicar:', error);
      }
    }
  }

  /**
   * Handler para botão Atualizar
   */
  async handleRefresh() {
    if (this.onRefreshCallback && typeof this.onRefreshCallback === 'function') {
      try {
        await this.onRefreshCallback();
        this.markClean();
      } catch (error) {
        console.error('[HeaderControls] Erro ao atualizar:', error);
      }
    }
  }

  /**
   * Rastreia mudanças em elementos dentro de uma config
   */
  trackChanges(container) {
    if (!container) return;
    
    const inputs = container.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (input.type === 'button') return;
      
      input.addEventListener('change', () => this.markDirty());
      input.addEventListener('input', () => this.markDirty());
    });
  }
}

// Instance global será criada no DOMContentLoaded
let headerControls = null;
console.log('[HEADER-CONTROLS.JS] Arquivo carregado, instância será criada no DOMContentLoaded');
