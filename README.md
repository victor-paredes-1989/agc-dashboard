# AGC Dashboard

Dashboard automático alimentado pelo Google Sheets, publicado no Vercel.

---

## Como publicar (passo a passo)

### ETAPA 1 — Criar chave do Google

1. Acesse: https://console.cloud.google.com
2. Crie um projeto (pode chamar "AGC Dashboard")
3. No menu lateral: **APIs e Serviços → Biblioteca**
4. Pesquise **Google Sheets API** → clique → **Ativar**
5. Vá em **APIs e Serviços → Credenciais**
6. Clique **Criar credenciais → Chave de API**
7. Copie a chave gerada (começa com "AIza...")
8. Clique em **Restringir chave** → em "Restrições de API" selecione "Google Sheets API" → Salvar

### ETAPA 2 — Tornar a planilha pública (somente leitura)

1. Abra a planilha Master Dashboard
2. Clique em **Compartilhar** (canto superior direito)
3. Em "Acesso geral", mude para **Qualquer pessoa com o link**
4. Permissão: **Visualizador**
5. Clique em **Concluído**

### ETAPA 3 — Criar conta no GitHub e subir o código

1. Acesse https://github.com e crie uma conta (grátis)
2. Clique em **New repository**
3. Nome: `agc-dashboard` → **Create repository**
4. Siga as instruções para fazer upload dos arquivos desta pasta

### ETAPA 4 — Publicar no Vercel

1. Acesse https://vercel.com e crie conta com o GitHub
2. Clique **Add New → Project**
3. Importe o repositório `agc-dashboard`
4. Em **Environment Variables**, adicione:
   - `SHEET_ID` = `1mg38c7VS4JeY49sJqmTwp__TbuOKktTQGOJwVNZCdok`
   - `GOOGLE_API_KEY` = (sua chave do passo 1)
5. Clique **Deploy**

Pronto! O site vai estar no ar em ~2 minutos.

---

## Como atualizar os dados

Os dados são atualizados automaticamente a cada 1 hora.
Se quiser forçar atualização imediata: no Vercel, clique em **Deployments → Redeploy**.

---

## Estrutura da planilha Master

| Aba | Conteúdo |
|-----|----------|
| DASH AI MAI 26 | Métricas Acelera Imob — Maio |
| DASH AI ABR 26 | Métricas Acelera Imob — Abril |
| DASH MO MAI 26 | Métricas Mundo Ótico — Maio |
| DASH MO ABR 26 | Métricas Mundo Ótico — Abril |
| SEMANAS AI | Dados por semana — AI |
| SEMANAS MO | Dados por semana — MO |
| REUNIOES_AI_04 | Reuniões AI Abril (IMPORTRANGE) |
| REUNIOES_AI_05 | Reuniões AI Maio (IMPORTRANGE) |
| REUNIOES_MO_04 | Reuniões MO Abril (IMPORTRANGE) |
| REUNIOES_MO_05 | Reuniões MO Maio (IMPORTRANGE) |
