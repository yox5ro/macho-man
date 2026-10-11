# The backend must exist before Terraform can initialize or import resources.
import {
  to = cloudflare_r2_bucket.state
  id = "${var.account_id}/${var.state_bucket_name}/default"
}

resource "cloudflare_r2_bucket" "state" {
  account_id    = var.account_id
  name          = var.state_bucket_name
  jurisdiction  = "default"
  storage_class = "Standard"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_managed_domain" "state" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.state.name
  enabled     = false
}
