variable "account_id" {
  description = "Cloudflare account ID supplied by the protected GitHub environment."
  type        = string
  validation {
    condition     = can(regex("^[a-f0-9]{32}$", var.account_id))
    error_message = "Set the real Cloudflare account ID (32 lowercase hexadecimal characters)."
  }
}

variable "state_bucket_name" {
  description = "Existing private R2 bucket bootstrapped before backend initialization."
  type        = string
}

variable "enable_custom_domain" {
  description = "Enable after the zone is active and the first application version has been deployed."
  type        = bool
  default     = false
}
