bucket = "kingchappers-terraform-state-bucket"
key    = "hearthwise-infra-setup/terraform.tfstate"
region = "eu-west-2"
# The lock is a ".tflock" object beside the state, so it stays inside the key prefix the deploy role may write.
use_lockfile = true
