variable "account_id" {
  description = "Cloudflare account ID. Set as a Terraform variable in HCP Terraform."
  type        = string
  validation {
    condition     = can(regex("^[a-f0-9]{32}$", var.account_id))
    error_message = "Set the real Cloudflare account ID (32 lowercase hexadecimal characters)."
  }
}

variable "enable_custom_domain" {
  description = "Enable after the zone is active and the first application version has been deployed."
  type        = bool
  default     = false
}
