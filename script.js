// Smooth scroll para links internos
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Header fixo com background quando scroll
window.addEventListener('scroll', function() {
    const header = document.querySelector('.header');
    const scrollPosition = window.scrollY;
    
    if (scrollPosition > 100) {
        header.style.background = 'rgba(255, 255, 255, 0.98)';
        header.style.boxShadow = '0 5px 25px rgba(0,0,0,0.1)';
    } else {
        header.style.background = 'rgba(255, 255, 255, 0.95)';
        header.style.boxShadow = '0 2px 20px rgba(0,0,0,0.1)';
    }
});

// Função para scroll suave para seções
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Form submission com validação
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Simular envio
    const formData = new FormData(this);
    const name = formData.get('name') || 'Usuário';
    
    // Mostrar mensagem de sucesso
    showNotification('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
    
    // Resetar formulário
    this.reset();
});

// Sistema de notificação
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    
    // Estilos da notificação
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? '#4CAF50' : '#2196F3'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideInRight 0.3s ease;
    `;
    
    notification.querySelector('button').style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Contador para produtos no carrinho (simulado)
let cartCount = 0;

// Adicionar ao carrinho
document.querySelectorAll('.produto-btn').forEach(button => {
    button.addEventListener('click', function() {
        cartCount++;
        updateCartCounter();
        
        const productName = this.closest('.produto-card').querySelector('h3').textContent;
        showNotification(`"${productName}" adicionado ao carrinho!`, 'success');
        
        // Efeito visual no botão
        this.style.background = '#4CAF50';
        this.textContent = '✓ Adicionado';
        
        setTimeout(() => {
            this.style.background = '#e91e63';
            this.textContent = 'Adicionar ao Carrinho';
        }, 2000);
    });
});

function updateCartCounter() {
    let counter = document.querySelector('.cart-counter');
    if (!counter) {
        // Criar contador se não existir
        const nav = document.querySelector('.nav');
        counter = document.createElement('div');
        counter.className = 'cart-counter';
        counter.style.cssText = `
            position: absolute;
            top: 10px;
            right: -10px;
            background: #e91e63;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        `;
        
        // Adicionar ícone do carrinho
        const cartIcon = document.createElement('span');
        cartIcon.textContent = '🛒';
        cartIcon.style.position = 'relative';
        cartIcon.style.marginLeft = '10px';
        cartIcon.appendChild(counter);
        
        const navLinks = document.querySelector('.nav-links');
        const cartItem = document.createElement('li');
        cartItem.appendChild(cartIcon);
        navLinks.appendChild(cartItem);
    }
    
    counter.textContent = cartCount;
    counter.style.display = cartCount > 0 ? 'flex' : 'none';
}

// Animação de entrada dos elementos
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            
            // Efeito de stagger para produtos
            if (entry.target.classList.contains('produto-card')) {
                const cards = Array.from(document.querySelectorAll('.produto-card'));
                const index = cards.indexOf(entry.target);
                entry.target.style.transitionDelay = `${index * 0.1}s`;
            }
        }
    });
}, observerOptions);

// Observar elementos para animação
document.querySelectorAll('.produto-card, .sobre-content, .contato-content, .file-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Efeito de digitação no hero (opcional)
function typeWriter(element, text, speed = 50) {
    let i = 0;
    element.innerHTML = '';
    
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

// Iniciar efeito de digitação quando a página carregar
window.addEventListener('load', function() {
    const heroTitle = document.querySelector('.hero-content h1');
    const originalText = heroTitle.textContent;
    typeWriter(heroTitle, originalText, 80);
});

// Contador de estatísticas (opcional)
function startCounters() {
    const counters = document.querySelectorAll('.counter');
    
    counters.forEach(counter => {
        const target = +counter.getAttribute('data-target');
        const increment = target / 100;
        let current = 0;
        
        const updateCounter = () => {
            if (current < target) {
                current += increment;
                counter.textContent = Math.ceil(current);
                setTimeout(updateCounter, 20);
            } else {
                counter.textContent = target;
            }
        };
        
        updateCounter();
    });
}

// Verificar quando a seção de estatísticas está visível
const statsObserver = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            startCounters();
            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

// Adicionar estilos para notificações
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .notification.success {
        background: #4CAF50 !important;
    }
    
    .notification.error {
        background: #f44336 !important;
    }
    
    .notification.warning {
        background: #ff9800 !important;
    }
    
    /* Efeito de hover nos cards de download */
    .file-card:hover .file-icon {
        animation: bounce 0.5s ease;
    }
    
    @keyframes bounce {
        0%, 20%, 60%, 100% {
            transform: translateY(0);
        }
        40% {
            transform: translateY(-10px);
        }
        80% {
            transform: translateY(-5px);
        }
    }
    
    /* Loading para os botões de download */
    .download-btn.loading {
        position: relative;
        color: transparent;
    }
    
    .download-btn.loading::after {
        content: '';
        position: absolute;
        width: 20px;
        height: 20px;
        top: 50%;
        left: 50%;
        margin: -10px 0 0 -10px;
        border: 2px solid transparent;
        border-top: 2px solid #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Efeito de loading nos downloads
document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        // Simular loading
        this.classList.add('loading');
        
        setTimeout(() => {
            this.classList.remove('loading');
        }, 2000);
    });
});

// Detecção de tema preferido do usuário
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
}

// Otimização de performance - Lazy loading para imagens
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Console greeting
console.log('🎨 ModaStyle - Landing Page carregada com sucesso!');
console.log('🚀 Desenvolvido com carinho para sua loja de roupas');