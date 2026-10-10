mock_provider "cloudflare" {
  override_during = plan
}

variables {
  account_id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

override_resource {
  target          = cloudflare_d1_database.app
  override_during = plan
  values = {
    id = "12345678-1234-4234-8234-123456789abc"
  }
}

run "bootstrap_without_public_domain" {
  command = plan

  assert {
    condition     = length(cloudflare_workers_custom_domain.app) == 0
    error_message = "Bootstrap must not publish a custom domain before DNS and code are ready."
  }

  assert {
    condition     = !cloudflare_worker.app.subdomain.enabled && !cloudflare_worker.app.subdomain.previews_enabled
    error_message = "Production must not expose workers.dev or preview URLs."
  }

  assert {
    condition     = output.wrangler_config.name == cloudflare_worker.app.name && output.wrangler_config.d1_databases[0].database_id == cloudflare_d1_database.app.id
    error_message = "The release configuration must use Terraform's Worker and D1 resources."
  }

  assert {
    condition     = output.wrangler_config.assets.run_worker_first == ["/api/*"] && output.wrangler_config.assets.not_found_handling == "single-page-application"
    error_message = "API requests must reach the Worker while frontend routes use the SPA."
  }
}

run "publish_custom_domain_after_bootstrap" {
  command = plan
  variables {
    enable_custom_domain = true
  }

  assert {
    condition     = length(cloudflare_workers_custom_domain.app) == 1 && cloudflare_workers_custom_domain.app[0].service == cloudflare_worker.app.name
    error_message = "The application domain must point at the Terraform-managed Worker."
  }
}
