resource "cloudflare_zone" "app" {
  account = { id = var.account_id }
  name    = "yox5ro.net"
  type    = "full"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_d1_database" "app" {
  account_id = var.account_id
  name       = "macho-man"

  lifecycle {
    prevent_destroy = true
  }
}

# Worker versions are released by Actions; Terraform never uploads application code.
resource "cloudflare_worker" "app" {
  account_id = var.account_id
  name       = "macho-man"
  subdomain = {
    enabled          = false
    previews_enabled = false
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_workers_custom_domain" "app" {
  count      = var.enable_custom_domain ? 1 : 0
  account_id = var.account_id
  hostname   = "macho-man.yox5ro.net"
  service    = cloudflare_worker.app.name
  zone_id    = cloudflare_zone.app.id
}
