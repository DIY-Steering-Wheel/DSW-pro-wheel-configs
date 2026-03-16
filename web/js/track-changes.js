/**
 * Adjacent Config Change Tracker
 * Detecta mudanças em inputs e notifica o header principal
 * Deve ser incluído em cada configuração adjacente
 * 
 * Uso: Adicionar antes do fechamento do </body>
 * <script src="../../js/track-changes.js"></script>
 */

// Comunicação com a página principal (parent)
function notifyParentOfChange() {
  if (window.parent && window.parent.headerControls) {
    window.parent.headerControls.markDirty();
  }
}

// Rastrear mudanças normalmente
document.addEventListener('change', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
    if (e.target.type !== 'button' && e.target.type !== 'submit') {
      notifyParentOfChange();
    }
  }
}, true);

document.addEventListener('input', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.target.type !== 'button' && e.target.type !== 'submit') {
      notifyParentOfChange();
    }
  }
}, true);
