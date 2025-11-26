// Script do renderer process
const NOTIFICATION_DENIED_MESSAGE = 'Notificações bloqueadas pelo usuário. Altere as permissões nas configurações do navegador para receber notificações.';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Franguxo Gestor de Pedidos - Renderer carregado');

    // Simular carregamento por alguns segundos
    const loadingScreen = document.getElementById('loading-screen');
    const errorScreen = document.getElementById('error-screen');

    // Função para ocultar a tela de carregamento
    const hideLoadingScreen = () => {
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.transition = 'opacity 0.5s ease-out';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    };

    // Função para mostrar tela de erro
    const showErrorScreen = () => {
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        if (errorScreen) {
            errorScreen.style.display = 'flex';
        }
    };

    // Verificar se o site está acessível
    const checkSiteAccessibility = async () => {
        try {
            // Aguardar um tempo para simular carregamento
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Em um app real, você faria uma verificação de conectividade aqui
            // Por ora, vamos assumir que está tudo OK e ocultar a tela de carregamento
            hideLoadingScreen();
            
            // Se chegou até aqui, o site deve estar carregando
            console.log('Site do Franguxo carregado com sucesso');
            
        } catch (error) {
            console.error('Erro ao carregar o site:', error);
            showErrorScreen();
        }
    };

    // Iniciar verificação
    checkSiteAccessibility();

    // Adicionar listener para teclas de atalho
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + R para recarregar
        if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
            event.preventDefault();
            location.reload();
        }

        // F5 para recarregar
        if (event.key === 'F5') {
            event.preventDefault();
            location.reload();
        }

        // F11 para tela cheia (será tratado pelo processo principal)
        if (event.key === 'F11') {
            event.preventDefault();
        }
    });

    // Verificar se a API do Electron está disponível
    if (window.electronAPI) {
        console.log('API do Electron disponível');
        
        // Exemplo de uso da API
        window.electronAPI.getAppVersion?.().then(version => {
            console.log('Versão da aplicação:', version);
        }).catch(err => {
            console.log('Não foi possível obter a versão da aplicação');
        });
    } else {
        console.log('API do Electron não disponível - rodando no navegador');
    }
});

// Função para recarregar a aplicação
window.reloadApp = () => {
    location.reload();
};

// Função para mostrar notificação (se disponível)
window.showNotification = (title, message) => {
    if (window.electronAPI && window.electronAPI.showNotification) {
        window.electronAPI.showNotification(title, message);
        // Solicitar restauração da janela ao receber notificação
        if (window.electronAPI.restoreWindowOnNotification) {
            window.electronAPI.restoreWindowOnNotification();
        }
    } else if ('Notification' in window) {
        // Fallback para notificações web
        if (Notification.permission === 'granted') {
            new Notification(title, { body: message });
        } else if (Notification.permission === 'denied') {
            console.warn(NOTIFICATION_DENIED_MESSAGE);
        } else {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body: message });
                } else if (permission === 'denied') {
                    console.warn(NOTIFICATION_DENIED_MESSAGE);
                }
            });
        }
    }
};

// Log de informações do sistema
console.log('Informações do sistema:', {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine
});
