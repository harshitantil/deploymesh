provider "aws" {
  region = "eu-north-1"
}

resource "aws_instance" "cloudforge" {
  ami           = "ami-08eb150f611ca277f"  # Amazon Linux 2 (eu-north-1)
  instance_type = "t3.micro"
  key_name      = "cloudforge-key"

  tags = {
    Name = "cloudforge-server"
  }
}

output "public_ip" {
  value = aws_instance.cloudforge.public_ip
}
