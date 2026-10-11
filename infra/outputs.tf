output "name_servers" {
  description = "Set these nameservers at the domain registrar after preserving existing DNS records."
  value       = cloudflare_zone.app.name_servers
}

output "database_id" {
  value = cloudflare_d1_database.app.id
}

# The applied output is the only source of production version configuration.
output "wrangler_config" {
  value = {
    name                = cloudflare_worker.app.name
    account_id          = var.account_id
    main                = "server/src/index.ts"
    compatibility_date  = "2026-10-10"
    compatibility_flags = ["nodejs_compat"]
    workers_dev         = false
    preview_urls        = false
    d1_databases = [{
      binding        = "DB"
      database_name  = cloudflare_d1_database.app.name
      database_id    = cloudflare_d1_database.app.id
      migrations_dir = "server/migrations"
    }]
    assets = {
      directory          = "./client/dist"
      binding            = "ASSETS"
      not_found_handling = "single-page-application"
      run_worker_first   = ["/api/*"]
    }
  }
}
