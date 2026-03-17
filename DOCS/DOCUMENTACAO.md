# 📚 Documentação - Índice de Navegação

## 📖 Documentos Principais

Bem-vindo à documentação completa do **DSW Pro Wheel Configurator**!

Esta pasta contém toda a documentação técnica sobre a estrutura, padrões e como trabalhar com o projeto.

### Escolha seu Ponto de Partida:

---

## 🚀 **Vou adicionar uma nova configuração**
→ [ARQUITETURA.md - "Como Adicionar uma Nova Configuração"](./ARQUITETURA.md#como-adicionar-uma-nova-configuração)

**O que você vai aprender:**
- Passo a passo para criar nova config
- Estrutura de diretórios
- Código mínimo necessário
- Como registrar no backend

**Tempo estimado:** 15 minutos

---

## 🔧 **Preciso entender a estrutura**
→ [ARQUITETURA.md - Completo](./ARQUITETURA.md)

**O que está lá:**
- Visão geral da arquitetura
- Estrutura de diretórios
- Componentes principais
- Sistema de configurações adjacentes
- Regras: o que é permitido/proibido
- API de botões do header
- Variáveis CSS disponíveis

**Tempo estimado:** 30 minutos de leitura

---

## 💻 **Quero ver exemplos de código real**
→ [EXEMPLOS_PRATICOS.md](./EXEMPLOS_PRATICOS.md)

**Exemplos inclusos:**
1. Input simples
2. Toggle switch
3. Range slider
4. Grid de itens
5. Validação complexa
6. Estados carregando

Cada um com **HTML + JavaScript + CSS** completo e com explicações.

**Tempo estimado:** 20 minutos

---

## 🐛 **Tenho um problema / erro**
→ [FAQ_TROUBLESHOOTING.md](./FAQ_TROUBLESHOOTING.md)

**Problemas cobertos:**
- Botões não aparecem
- Mudanças não são detectadas
- Botão "Aplicar" não funciona
- Estilos não aplicam
- API retorna erro
- Página em branco
- Indicador fica piscando
- Debug checklist
- Testes manuais
- Snippets úteis para Console

**Tempo estimado:** 5 minutos (encontrar seu problema)

---

## ⚡ **Preciso de referência rápida**
→ [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)

**Conteúdo rápido:**
- Estrutura mínima
- Comandos Console
- Classes CSS disponíveis
- Variáveis CSS
- Checklist pré-commit
- Top 3 erros comuns
- Debugging rápido
- Fluxo completo de interação
- Best practices

**Tempo estimado:** 2 minutos (copiar/colar referências)

---

## 🎓 O que eu preciso saber?

### Iniciante? Comece aqui:
1. Ler [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - 2 min
2. Ler [ARQUITETURA.md](./ARQUITETURA.md) "Visão Geral" - 5 min
3. Ver [EXEMPLOS_PRATICOS.md](./EXEMPLOS_PRATICOS.md) - 20 min
4. Praticar criando uma config simples - 30 min

**Total:** ~1 hora

### Intermediário? Vá diretamente:
- Procurar exemplo similar em [EXEMPLOS_PRATICOS.md](./EXEMPLOS_PRATICOS.md)
- Adaptar para seu caso
- Consultar [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) conforme necessário

### Avançado?
- [ARQUITETURA.md](./ARQUITETURA.md) tem todos os detalhes
- [FAQ_TROUBLESHOOTING.md](./FAQ_TROUBLESHOOTING.md) tem soluções de edge cases

---

## 📋 Resumo Rápido das Regras

### ✅ PERMITIDO em `configuracoes-adjacentes/X/`:
- ✅ HTML, CSS, JavaScript local
- ✅ Usar classes CSS do tema
- ✅ Chamar APIs do backend
- ✅ Validar dados
- ✅ Monitorar mudanças

### ❌ PROIBIDO em `configuracoes-adjacentes/X/`:
- ❌ Adicionar títulos (vai no header principal)
- ❌ Adicionar botões de ação (vai no header principal)
- ❌ Modificar CSS global
- ❌ Mudar estrutura HTML esperada
- ❌ Remover track-changes.js

---

## 🎯 Tarefas Comuns

### Tarefa: "Adicionar um novo campo de entrada"
```
1. Abrir exemplo similar em EXEMPLOS_PRATICOS.md
2. Copiar o código (HTML + JS + CSS)
3. Adaptar IDs e nomes
4. Testar no navegador (F12)
```

### Tarefa: "Mudar cor de um elemento"
```
1. Procurar a classe em QUICK_REFERENCE.md
2. Adicionar em style.css local:
   .minha-classe { color: var(--primary-color); }
3. Usar variáveis CSS, nunca hardcode cores
```

### Tarefa: "Debug - nada funciona"
```
1. Abrir F12 (DevTools)
2. Verificar console por erros
3. Procurar erro em FAQ_TROUBLESHOOTING.md
4. Seguir solução
5. Se não encontrar, adicionar console.log()
```

### Tarefa: "Adicionar nova config (ex: Vibração)"
```
1. Ler "Como Adicionar uma Nova Configuração" em ARQUITETURA.md
2. Seguir passos 1-7
3. Testar em navegador
4. Backend adiciona API endpoints
5. Done!
```

---

## 🔗 Atalhos de Navegação

| Tarefa | Link | Tempo |
|--------|------|-------|
| **Setup Inicial** | [ARQUITETURA.md](./ARQUITETURA.md) | 30 min |
| **Novo Componente** | [EXEMPLOS_PRATICOS.md](./EXEMPLOS_PRATICOS.md) | 20 min |
| **Problema?** | [FAQ_TROUBLESHOOTING.md](./FAQ_TROUBLESHOOTING.md) | 5 min |
| **Referência Rápida** | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | 2 min |
| **Nova Config Inteira** | [ARQUITETURA.md - "Como Adicionar"](./ARQUITETURA.md#como-adicionar-uma-nova-configuração) | 30 min |

---

## 📞 Estrutura de Arquivo

```
DSW-pro-wheel-configs/
│
├── ARQUITETURA.md              ← Documentação técnica completa
├── EXEMPLOS_PRATICOS.md        ← Código real com exemplos
├── FAQ_TROUBLESHOOTING.md      ← Problemas e soluções
├── QUICK_REFERENCE.md          ← Referência rápida
├── DOCUMENTACAO.md             ← Este arquivo (índice)
│
├── web/
│   ├── index.html
│   ├── js/
│   │   ├── app.js
│   │   ├── header-controls.js  ⭐ API de botões
│   │   └── track-changes.js    ⭐ Detector automático
│   │
│   ├── css/
│   │   └── theme.css
│   │
│   └── configuracoes-adjacentes/
│       ├── ain/
│       ├── cambio/
│       ├── din/
│       ├── encoder/
│       ├── force-feedback/
│       └── pwm/
│
├── app.py                       ← Backend
├── backend.py
└── profiles.json
```

---

## 🌟 Principais Conceitos

### 1. **Configurações Adjacentes**
Painéis independentes em iframes que gerenciam diferentes aspectos do hardware.
- Isoladas: cada uma tem seu HTML/CSS/JS
- Comunicam via `window.parent`
- Botões de ação centralizados no header

### 2. **HeaderControls**
API centralizada para gerenciar botões "Aplicar" e "Atualizar".
- Criada automaticamente
- Detecta mudanças via `track-changes.js`
- Mostra/esconde conforme necessário

### 3. **Track Changes**
Script que detecta automaticamente mudanças em formulários.
- Escuta eventos `change` e `input`
- Chama `markDirty()` do HeaderControls
- Mostra indicador visual (ponto amarelo)

### 4. **Temas e Variáveis CSS**
Sistema de cores e estilos consistentes.
- Variáveis CSS: `--primary-color`, `--text`, etc.
- Classes utilitárias: `.adjacent-card`, `.adjacent-label`, etc.
- Todas as configs herdam do tema principal

---

## ✨ Boas Práticas

1. **Sempre usar variáveis CSS** para cores
   ```css
   ✅ background: var(--surface);
   ❌ background: #16213e;
   ```

2. **Retornar boolean em funções async**
   ```javascript
   ✅ return response?.ok ?? false;
   ❌ return response;
   ```

3. **Usar try/catch em APIs**
   ```javascript
   ✅ try { /*...*/ } catch (e) { console.error(e); }
   ❌ const data = await api.call();  // Sem tratamento
   ```

4. **Estrutura HTML padrão**
   ```html
   ✅ <div class="adjacent-page"> ... </div>
   ❌ <div id="my-custom-wrapper"> ... </div>
   ```

5. **Incluir track-changes.js sempre**
   ```html
   ✅ <script src="../../js/track-changes.js"></script>
   ❌ <!-- Esqueci de incluir -->
   ```

---

## 🚀 Próximos Passos

### Se você é novo no projeto:
- [ ] Ler [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- [ ] Ler [ARQUITETURA.md](./ARQUITETURA.md) completo
- [ ] Estudar [EXEMPLOS_PRATICOS.md](./EXEMPLOS_PRATICOS.md)
- [ ] Criar uma config de teste
- [ ] Fazer commit da primeira config

### Se você vai adicionar feature:
- [ ] Revisar [ARQUITETURA.md](./ARQUITETURA.md) - "Regras"
- [ ] Procurar exemplo similar em [EXEMPLOS_PRATICOS.md](./EXEMPLOS_PRATICOS.md)
- [ ] Implementar
- [ ] Testar checklist em [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
- [ ] Commit

### Se tem problema:
- [ ] Procurar em [FAQ_TROUBLESHOOTING.md](./FAQ_TROUBLESHOOTING.md)
- [ ] Se não encontrar, adicionar `console.log()` para debug
- [ ] Revisar [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - "Debugging Rápido"

---

## 📚 Recursos Externos

- **MDN - JavaScript**: https://developer.mozilla.org/en-US/docs/Web/JavaScript
- **CSS Variáveis**: https://developer.mozilla.org/en-US/docs/Web/CSS/--*
- **Async/Await**: https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises
- **DOM API**: https://developer.mozilla.org/en-US/docs/Web/API/Document

---

## 📝 Changelog

### v1.0 - Documentação Inicial
- ✅ ARQUITETURA.md - Estrutura completa
- ✅ EXEMPLOS_PRATICOS.md - Código real
- ✅ FAQ_TROUBLESHOOTING.md - Problemas e soluções
- ✅ QUICK_REFERENCE.md - Referência rápida
- ✅ DOCUMENTACAO.md - Este índice

---

## 🎤 Feedbacks?

Se encontrar:
- **Erro de digitação**: Corrigir
- **Documentação incompleta**: Adicionar mais detalhes
- **Exemplo confuso**: Simplificar ou adicionar comentários
- **Faltou algo**: Criar novo documento

---

## 🏁 TL;DR (Muito Longo; Não Li)

**Para iniciantes:**
1. Ler [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) (2 min)
2. Ver exemplo em [EXEMPLOS_PRATICOS.md](./EXEMPLOS_PRATICOS.md) (20 min)
3. Copiar/adaptar para seu caso (30 min)
4. Done! ✅

**Para ter problema:**
→ [FAQ_TROUBLESHOOTING.md](./FAQ_TROUBLESHOOTING.md) (5 min)

**Para detalhes técnicos:**
→ [ARQUITETURA.md](./ARQUITETURA.md) (30 min)

---

**Última atualização:** 16/03/2026

Aproveite! 🚀

