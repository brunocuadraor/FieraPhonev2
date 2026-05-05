(function() {
  const styles = `
    #fieraChatWidget { position: fixed; bottom: 20px; right: 20px; width: 350px; background: #141414; border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); display: none; flex-direction: column; z-index: 10000; border: 1px solid #333; font-family: 'Outfit', sans-serif; }
    #fieraChatHeader { background: #C94B1F; color: white; padding: 15px; border-radius: 14px 14px 0 0; display: flex; justify-content: space-between; align-items: center; }
    #fieraChatMessages { height: 350px; overflow-y: auto; padding: 10px; }
    #fieraChatInput { padding: 10px; display: flex; gap: 5px; }
    .fieraMsg { margin: 8px 0; padding: 10px; border-radius: 10px; max-width: 85%; font-size: 14px; line-height: 1.4; }
    .fieraMsg.bot { background: #2A2A25; margin-right: auto; }
    .fieraMsg.user { background: #C94B1F; margin-left: auto; }
    #fieraChatText { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #333; background: #0E0E0C; color: white; font-family: inherit; }
    #fieraSendBtn { background: #C94B1F; border: none; color: white; padding: 10px 15px; border-radius: 8px; cursor: pointer; }
    #fieraChatBtn { position: fixed; bottom: 20px; right: 20px; background: #C94B1F; color: white; border: none; width: 60px; height: 60px; border-radius: 50%; font-size: 24px; cursor: pointer; box-shadow: 0 4px 16px rgba(201,75,31,0.4); z-index: 9999; }
  `;

  const html = `
    <div id="fieraChatWidget">
      <div id="fieraChatHeader"><strong>🤖 Asistente FieraPhone</strong><button onclick="fieraChat.toggle()" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;">&times;</button></div>
      <div id="fieraChatMessages"></div>
      <div id="fieraChatInput">
        <input id="fieraChatText" type="text" placeholder="Escribe tu pregunta..." onkeypress="if(event.key==='Enter')fieraChat.send()">
        <button id="fieraSendBtn" onclick="fieraChat.send()">➤</button>
      </div>
    </div>
    <button id="fieraChatBtn" onclick="fieraChat.toggle()">💬</button>
  `;

  const inject = () => {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
    document.body.insertAdjacentHTML('beforeend', html);
    window.fieraChat = {
      addMsg: (sender, text) => {
        const el = document.createElement('div');
        el.className = `fieraMsg ${sender}`;
        el.innerHTML = text.replace(/\n/g, '<br>');
        const msgs = document.getElementById('fieraChatMessages');
        msgs.appendChild(el);
        msgs.scrollTop = msgs.scrollHeight;
      },
      toggle: () => {
        const w = document.getElementById('fieraChatWidget');
        const b = document.getElementById('fieraChatBtn');
        if (w.style.display === 'none') { w.style.display = 'flex'; b.style.display = 'none'; }
        else { w.style.display = 'none'; b.style.display = 'block'; }
      },
      send: async () => {
        const input = document.getElementById('fieraChatText');
        const msg = input.value.trim();
        if (!msg) return;
        fieraChat.addMsg('user', msg);
        input.value = '';
        const typing = document.createElement('div');
        typing.className = 'fieraMsg bot';
        typing.id = 'fieraTyping';
        typing.textContent = 'Escribiendo...';
        document.getElementById('fieraChatMessages').appendChild(typing);
        try {
          const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
          const d = await r.json();
          typing.remove();
          fieraChat.addMsg('bot', d.reply || 'Lo siento, hubo un error.');
        } catch {
          typing.remove();
          fieraChat.addMsg('bot', 'Error de conexión. Inténtalo de nuevo.');
        }
      }
    };
    fieraChat.addMsg('bot', '¡Hola! Soy el asistente de FieraPhone. Puedo ayudarte con:\n• Reparaciones (pantallas, baterías, móviles mojados...)\n• Precios y tiempos\n• Domicilio y recogida\n• Horarios y ubicaciones\n\n¿En qué necesitas ayuda?');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();