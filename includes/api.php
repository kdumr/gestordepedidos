<?php
/**
 * API de Webhooks para Mercado Pago
 * 
 * Este arquivo processa as notificações de webhooks do Mercado Pago.
 * Todas as requisições são validadas antes de serem processadas.
 */

// Impedir acesso direto
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Valida a assinatura do webhook do Mercado Pago.
 * 
 * A validação é feita de acordo com a documentação oficial:
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * @param string $webhook_secret O segredo configurado no Mercado Pago
 * @return bool True se a assinatura for válida, false caso contrário
 */
function validar_assinatura_mercadopago($webhook_secret) {
    // Obter os headers necessários
    $x_signature = isset($_SERVER['HTTP_X_SIGNATURE']) ? $_SERVER['HTTP_X_SIGNATURE'] : '';
    $x_request_id = isset($_SERVER['HTTP_X_REQUEST_ID']) ? $_SERVER['HTTP_X_REQUEST_ID'] : '';
    
    // Verificar se os headers obrigatórios existem
    if (empty($x_signature) || empty($x_request_id)) {
        error_log('MercadoPago Webhook: Headers obrigatórios ausentes (x-signature ou x-request-id)');
        return false;
    }
    
    // Obter o corpo da requisição e extrair data.id
    $raw_body = file_get_contents('php://input');
    $body = json_decode($raw_body, true);
    
    if (json_last_error() !== JSON_ERROR_NONE || !isset($body['data']['id'])) {
        error_log('MercadoPago Webhook: Corpo da requisição inválido ou data.id ausente');
        return false;
    }
    
    $data_id = $body['data']['id'];
    
    // Extrair ts e v1 do header x-signature
    // Formato: ts=1234567890,v1=abc123def456...
    $ts = '';
    $v1 = '';
    
    $signature_parts = explode(',', $x_signature);
    foreach ($signature_parts as $part) {
        $key_value = explode('=', $part, 2);
        if (count($key_value) === 2) {
            $key = trim($key_value[0]);
            $value = trim($key_value[1]);
            
            if ($key === 'ts') {
                $ts = $value;
            } elseif ($key === 'v1') {
                $v1 = $value;
            }
        }
    }
    
    // Verificar se ts e v1 foram extraídos corretamente
    if (empty($ts) || empty($v1)) {
        error_log('MercadoPago Webhook: Não foi possível extrair ts ou v1 do header x-signature');
        return false;
    }
    
    // Criar o manifest conforme documentação do Mercado Pago
    // Formato: id:{data.id};request-id:{x-request-id};ts:{ts};
    $manifest = "id:{$data_id};request-id:{$x_request_id};ts:{$ts};";
    
    // Calcular o HMAC-SHA256 usando o webhook secret
    $calculated_signature = hash_hmac('sha256', $manifest, $webhook_secret);
    
    // Comparar as assinaturas de forma segura (timing-safe)
    if (!hash_equals($calculated_signature, $v1)) {
        error_log('MercadoPago Webhook: Assinatura inválida');
        return false;
    }
    
    return true;
}

/**
 * Processa o webhook do Mercado Pago.
 * Só executa as funções se a assinatura for válida.
 */
function processar_webhook_mercadopago() {
    // Obter o segredo do webhook das configurações do plugin
    $webhook_secret = get_option('mercadopago_webhook_secret', '');
    
    // Verificar se o segredo está configurado
    if (empty($webhook_secret)) {
        error_log('MercadoPago Webhook: Segredo do webhook não configurado');
        wp_send_json_error(array('message' => 'Configuração incompleta'), 500);
        return;
    }
    
    // Validar a assinatura antes de processar qualquer coisa
    if (!validar_assinatura_mercadopago($webhook_secret)) {
        error_log('MercadoPago Webhook: Requisição rejeitada - assinatura inválida');
        wp_send_json_error(array('message' => 'Assinatura inválida'), 401);
        return;
    }
    
    // Assinatura válida - processar o webhook
    error_log('MercadoPago Webhook: Assinatura válida - processando webhook');
    
    // Obter os dados do webhook
    $raw_body = file_get_contents('php://input');
    $webhook_data = json_decode($raw_body, true);
    
    if (!$webhook_data) {
        wp_send_json_error(array('message' => 'Dados inválidos'), 400);
        return;
    }
    
    // Processar de acordo com o tipo de notificação
    $action = isset($webhook_data['action']) ? $webhook_data['action'] : '';
    $type = isset($webhook_data['type']) ? $webhook_data['type'] : '';
    
    // Hook para permitir extensão do processamento
    do_action('mercadopago_webhook_validated', $webhook_data, $action, $type);
    
    // Responder com sucesso
    wp_send_json_success(array('message' => 'Webhook processado com sucesso'));
}

/**
 * Registra o endpoint REST API para o webhook do Mercado Pago.
 */
function registrar_endpoint_webhook_mercadopago() {
    register_rest_route('mercadopago/v1', '/webhook', array(
        'methods' => 'POST',
        'callback' => 'processar_webhook_mercadopago',
        'permission_callback' => '__return_true', // A validação é feita pela assinatura
    ));
}
add_action('rest_api_init', 'registrar_endpoint_webhook_mercadopago');
