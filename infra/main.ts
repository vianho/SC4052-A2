import { Construct } from "constructs";
import { App, TerraformStack } from "cdktn";
import {
  AzapiProvider,
  NetworkInterface,
  NetworkSecurityGroup,
  ResourceGroup,
  StorageAccount,
  Subnet,
  VirtualMachine,
  VirtualNetwork,
} from "@microsoft/terraform-cdk-constructs";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import { RoleAssignment } from "@cdktn/provider-azurerm/lib/role-assignment";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { ContainerAppEnvironment } from "@cdktn/provider-azurerm/lib/container-app-environment";
import { ContainerApp } from "@cdktn/provider-azurerm/lib/container-app";
import { ContainerRegistry } from "@cdktn/provider-azurerm/lib/container-registry";
import { KeyVault } from "@cdktn/provider-azurerm/lib/key-vault";
import { KeyVaultSecret } from "@cdktn/provider-azurerm/lib/key-vault-secret";
import { CloudflareProvider } from "@cdktn/provider-cloudflare/lib/provider";
import { ZeroTrustTunnelCloudflared } from "@cdktn/provider-cloudflare/lib/zero-trust-tunnel-cloudflared";
import { ZeroTrustTunnelCloudflaredConfigA } from "@cdktn/provider-cloudflare/lib/zero-trust-tunnel-cloudflared-config";
import { dnsRecord } from "@cdktn/provider-cloudflare";
import { DataCloudflareZeroTrustTunnelCloudflaredToken } from "@cdktn/provider-cloudflare/lib/data-cloudflare-zero-trust-tunnel-cloudflared-token";
import { ResourceProviderRegistration } from "@cdktn/provider-azurerm/lib/resource-provider-registration";
import { UserAssignedIdentity } from "@cdktn/provider-azurerm/lib/user-assigned-identity";
import { KeyVaultAccessPolicyA } from "@cdktn/provider-azurerm/lib/key-vault-access-policy";
class PagerankStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    // Azure for students allowed locations: ["centralindia","southeastasia","koreacentral","indonesiacentral","japaneast"]
    const locationCode = "koreacentral";
    const tags = {
      project: "pagerank",
      managed_by: "cdktn",
    }
    const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
    const azureTenantId = process.env.AZURE_TENANT_ID || "";
    const cloudflareZoneId = process.env.CLOUDFLARE_ZONE_ID || "";
    const apiDomainName = process.env.API_DOMAIN_NAME || "";

    new AzurermProvider(this, "Azurerm", {
      features: [{}],
    });
    new AzapiProvider(this, "AzApi", {
      defaultTags: tags,
    });
    new CloudflareProvider(this, "Cloudflare", {});

    const sshPublicKey = process.env.SSH_PUBLIC_KEY || "";
    if (!sshPublicKey) {
      throw new Error("SSH_PUBLIC_KEY environment variable is not set");
    }

    // 1. create a resource group
    const rg = new ResourceGroup(this, "rg", {
      name: "pagerank-rg",
      location: locationCode,
    });

    const appProvider = new ResourceProviderRegistration(this, "register-microsoft-app", {
      name: "Microsoft.App",
    });


    // 2. setup storage
    const storageAccount = new StorageAccount(this, "storage", {
      name: "sc4052assignment2",
      resourceGroupId: rg.id,
      location: rg.location,
      sku: { name: "Standard_LRS" },
    });


    // Create keyvault
    const kv = new KeyVault(this, "kv", {
      name: "graphrag-app-kv",
      resourceGroupName: rg.name,
      location: locationCode,
      skuName: "standard",
      tenantId: azureTenantId,
    });

    const geminiKey = new KeyVaultSecret(this, "geminiKey", {
      name: "GEMINI-API-KEY",
      value: process.env.GEMINI_API_KEY,
      keyVaultId: kv.id,
    });

    // 3. setup network
    const vnet = new VirtualNetwork(this, "vnet", {
      name: "vnet",
      resourceGroupId: rg.id,
      location: rg.location,
      addressSpace: {
        addressPrefixes: ["10.0.0.0/16"],
      }
    });

    const snet1 = new Subnet(this, "snet1", {
      // note: forgot to change the name after selecting a different location :(
      name: "snet-app-mywest-01",
      virtualNetworkName: vnet.name,
      virtualNetworkId: vnet.id,
      resourceGroupId: rg.id,
      addressPrefix: "10.0.1.0/24",
    });

    const nsg = new NetworkSecurityGroup(this, "nsg", {
      name: "sc4052-nsg-22",
      resourceGroupId: rg.id,
      location: rg.location,
      securityRules: [
        {
          name: "SSH",
          properties: {
            priority: 100,
            direction: "Inbound",
            description: "Allow SSH from anywhere",
            access: "Allow",
            protocol: "Tcp",
            sourcePortRange: "*",
            destinationPortRange: "22",
            sourceAddressPrefix: "*",
            destinationAddressPrefix: "*",
          },
        },
      ],
    });

    const nic = new NetworkInterface(this, "nic", {
      name: "sc4502-2526a2-nic",
      location: rg.location,
      resourceGroupId: rg.id,
      networkSecurityGroup: {
        id: nsg.id,
      },
      ipConfigurations: [{
        name: "ipconfig1",
        subnet: { id: snet1.id },
        privateIPAllocationMethod: "Dynamic",
        primary: true,
      }],
    });

    // pre-4. read cloud-init script and replace placeholder with actual storage account name
    const scriptPath = path.resolve(__dirname, "scripts", "cloud-init.sh");
    const rawScript = fs.readFileSync(scriptPath, "utf-8");
    const userData = rawScript.replace("__STORAGE_ACCOUNT_NAME__", storageAccount.name);

    // 4. create vm
    new VirtualMachine(this, "vm", {
      name: "sc4052-2526a2",
      location: rg.location,
      resourceGroupId: rg.id,
      hardwareProfile: {
        vmSize: "Standard_B2als_v2",
      },
      storageProfile: {
        imageReference: {
          publisher: "Canonical",
          offer: "ubuntu-24_04-lts",
          sku: "minimal",
          version: "latest"
        },
        osDisk: {
          createOption: "FromImage",
          managedDisk: {
            storageAccountType: "Standard_LRS",
          },
        },
      },
      osProfile: {
        computerName: "sc4052",
        adminUsername: "azureuser",
        linuxConfiguration: {
          disablePasswordAuthentication: true,
          ssh: {
            publicKeys: [
              {
                path: "/home/azureuser/.ssh/authorized_keys",
                keyData: sshPublicKey
              },
            ],
          },
        },
        customData: Buffer.from(userData).toString('base64'),
      },
      networkProfile: {
        networkInterfaces: [
          {
            id: nic.id,
          },
        ],
      },
      // no redundancy needed to save credits
      zones: ["1"],
      // Assign Managed Identity to access Blob Storage
      identity: {
        type: "SystemAssigned"
      }
    });

    // 6. Cloudflare tunnel
    const tunnelSecret = crypto.randomBytes(32).toString("base64");
    const tunnel = new ZeroTrustTunnelCloudflared(this, "cf-tunnel", {
      accountId: cloudflareAccountId,
      name: "rust-azure-tunnel",
      tunnelSecret: tunnelSecret,
      configSrc: "cloudflare",
      lifecycle: {
        ignoreChanges: ["tunnel_secret"],
      }
    });

    new ZeroTrustTunnelCloudflaredConfigA(this, "cf-tunnel-config", {
      accountId: cloudflareAccountId,
      tunnelId: tunnel.id,
      config: {
        ingress: [
          {
            hostname: apiDomainName,
            service: "http://localhost:3000",
          },
          {
            service: "http_status:404",
          },
        ],
      },
    });

    // Create the DNS Record pointing apiDomainName to the tunnel
    new dnsRecord.DnsRecord(this, "cf-dns-record", {
      zoneId: cloudflareZoneId,
      name: apiDomainName.split(".")[0],
      content: `${tunnel.id}.cfargotunnel.com`,
      type: "CNAME",
      ttl: 1,
      proxied: true,
    });

    // grab tunnel token from data and store it in keyvault
    const tunnelToken = new DataCloudflareZeroTrustTunnelCloudflaredToken(this, "tunnelToken", {
      accountId: cloudflareAccountId,
      tunnelId: tunnel.id,
    })

    const cfTokenSecret = new KeyVaultSecret(this, "tunnel-token-secret", {
      name: "CLOUDFLARE-TUNNEL-TOKEN",
      value: tunnelToken.token,
      keyVaultId: kv.id,
    });

    // Create container apps for rust app
    const acr = new ContainerRegistry(this, "acr", {
      name: "graphragrs",
      resourceGroupName: rg.name,
      location: locationCode,
      sku: "Basic",
      adminEnabled: false,
    });

    const graphragCAEnv = new ContainerAppEnvironment(this, "graphragCAEnv", {
      name: "graphrag-ca-env",
      resourceGroupName: rg.name,
      location: locationCode,
      workloadProfile: [{
        maximumCount: 0,
        minimumCount: 0,
        name: "Consumption",
        workloadProfileType: "Consumption",
      }],
      dependsOn: [appProvider],
    });

    const appIdentity = new UserAssignedIdentity(this, "app-identity", {
      name: "graphragapp-identity",
      resourceGroupName: rg.name,
      location: locationCode,
    });

    const acrPullRole = new RoleAssignment(this, "acrPull", {
      roleDefinitionId: "/subscriptions/7d270f45-e4a4-435c-bb7c-40d93fa07ed5/providers/Microsoft.Authorization/roleDefinitions/7f951dda-4ed3-4680-a7ca-43fe172d538d",
      principalId: appIdentity.principalId,
      scope: acr.id,
      description: "Allow ACR pull for container app",
    });

    const kvPolicy = new KeyVaultAccessPolicyA(this, "kv-app-policy", {
      keyVaultId: kv.id,
      tenantId: azureTenantId,
      objectId: appIdentity.principalId,
      secretPermissions: ["Get", "List"],
    });

    new ContainerApp(this, "graphragApp", {
      name: "graphragrs",
      resourceGroupName: rg.name,
      containerAppEnvironmentId: graphragCAEnv.id,
      revisionMode: "Single",
      identity: {
        type: "SystemAssigned, UserAssigned",
        identityIds: [appIdentity.id],
      },
      workloadProfileName: "Consumption",
      registry: [
        {
          server: acr.loginServer,
          identity: "System",
        }
      ],
      template: {
        minReplicas: 1,
        maxReplicas: 1,
        container: [
          {
            name: "graphragrs",
            image: `${acr.loginServer}/graphrag:latest`,
            cpu: 0.25,
            memory: "0.5Gi",
            env: [
              {
                name: "GEMINI_API_KEY",
                secretName: "gemini-api-key",
              },
            ],
            readinessProbe: [{
              transport: "HTTP",
              port: 3000,
              path: "/api",
            }],
          },
          // cloudflare tunnel sidecar
          {
            name: "cloudflared-tunnel",
            image: "cloudflare/cloudflared:latest",
            command: ["/usr/local/bin/cloudflared", "tunnel", "--no-autoupdate", "run"],
            cpu: 0.25,
            memory: "0.5Gi",
            env: [
              {
                name: "TUNNEL_TOKEN",
                secretName: "cloudflared-tunnel-token",
              },
            ],
          },
        ],
      },
      ingress: {
        targetPort: 3000,
        trafficWeight: [{ percentage: 100, latestRevision: true }],
      },
      secret: [
        {
          name: "gemini-api-key",
          keyVaultSecretId: geminiKey.id,
          identity: appIdentity.id,
        },
        {
          name: "cloudflared-tunnel-token",
          keyVaultSecretId: cfTokenSecret.id,
          identity: appIdentity.id,
        }
      ],
      dependsOn: [acrPullRole, kvPolicy],
    });

  }
}

const app = new App();
new PagerankStack(app, "infra");
app.synth();
