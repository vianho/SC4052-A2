import * as crypto from "crypto";

import { Construct } from "constructs";
import { App, TerraformStack } from "cdktn";
import {
  AzapiProvider,
  ResourceGroup,
} from "@microsoft/terraform-cdk-constructs";

import { RoleAssignment } from "@cdktn/provider-azurerm/lib/role-assignment";
import { AzurermProvider } from "@cdktn/provider-azurerm/lib/provider";
import { ContainerAppEnvironment } from "@cdktn/provider-azurerm/lib/container-app-environment";
import { ContainerApp } from "@cdktn/provider-azurerm/lib/container-app";
import { ContainerRegistry } from "@cdktn/provider-azurerm/lib/container-registry";
import { KeyVault } from "@cdktn/provider-azurerm/lib/key-vault";
import { KeyVaultSecret } from "@cdktn/provider-azurerm/lib/key-vault-secret";
import { ResourceProviderRegistration } from "@cdktn/provider-azurerm/lib/resource-provider-registration";
import { UserAssignedIdentity } from "@cdktn/provider-azurerm/lib/user-assigned-identity";
import { KeyVaultAccessPolicyA } from "@cdktn/provider-azurerm/lib/key-vault-access-policy";

import { CloudflareProvider } from "@cdktn/provider-cloudflare/lib/provider";
import { dnsRecord, zeroTrustTunnelCloudflared, zeroTrustTunnelCloudflaredConfig } from "@cdktn/provider-cloudflare";
import { DataCloudflareZeroTrustTunnelCloudflaredToken } from "@cdktn/provider-cloudflare/lib/data-cloudflare-zero-trust-tunnel-cloudflared-token";

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

    // 1. create a resource group
    const rg = new ResourceGroup(this, "rg", {
      name: "pagerank-rg",
      location: locationCode,
    });

    const appProvider = new ResourceProviderRegistration(this, "register-microsoft-app", {
      name: "Microsoft.App",
    });

    // 2. Create keyvault
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

    // 3. Cloudflare tunnel
    const tunnelSecret = crypto.randomBytes(32).toString("base64");
    const tunnel = new zeroTrustTunnelCloudflared.ZeroTrustTunnelCloudflared(this, "cf-tunnel", {
      accountId: cloudflareAccountId,
      name: "rust-azure-tunnel",
      tunnelSecret: tunnelSecret,
      configSrc: "cloudflare",
      lifecycle: {
        ignoreChanges: ["tunnel_secret"],
      }
    });

    new zeroTrustTunnelCloudflaredConfig.ZeroTrustTunnelCloudflaredConfigA(this, "cf-tunnel-config", {
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

    // 4. Create the DNS Record pointing apiDomainName to the tunnel
    new dnsRecord.DnsRecord(this, "cf-dns-record", {
      zoneId: cloudflareZoneId,
      name: apiDomainName.split(".")[0],
      content: `${tunnel.id}.cfargotunnel.com`,
      type: "CNAME",
      ttl: 1,
      proxied: true,
    });

    // 5. grab tunnel token from data and store it in keyvault
    const tunnelToken = new DataCloudflareZeroTrustTunnelCloudflaredToken(this, "tunnelToken", {
      accountId: cloudflareAccountId,
      tunnelId: tunnel.id,
    })

    const cfTokenSecret = new KeyVaultSecret(this, "tunnel-token-secret", {
      name: "CLOUDFLARE-TUNNEL-TOKEN",
      value: tunnelToken.token,
      keyVaultId: kv.id,
    });

    // 6. Create azure container app for GraphRAG
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
