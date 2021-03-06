import { Path } from '@angular-devkit/core';
import { chain, FileEntry, Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { getWorkspace } from '@schematics/angular/utility/config';

import { Ngssc, Variant } from '../../models';
import ngAdd from '../ng-add/index';

const NGSSC_JSON_PATH = '/ngssc.json';

export function updateToV8(): Rule {
  return (tree: Tree) => {
    const ngssc = tryReadNgsscJson(tree);
    const variant = findAndPatchVariantFromFiles(tree);

    return chain([
      ngAdd({
        additionalEnvironmentVariables: (ngssc.environmentVariables || []).join(','),
        aotSupport: true,
        ngsscEnvironmentFile: 'src/environments/environment.prod.ts',
        project: '',
        variant,
      }),
      removeNgsscJson(),
      checkNgsscUsageInScripts(),
    ]);
  };
}

function tryReadNgsscJson(tree: Tree): Partial<Ngssc> {
  const ngssc = tree.read(NGSSC_JSON_PATH);
  return ngssc ? JSON.parse(ngssc.toString('utf8')) : {};
}

function findAndPatchVariantFromFiles(tree: Tree): Variant {
  let variant: Variant = 'process';
  const ngEnv4Import = 'angular-server-side-configuration/ng-env4';
  const ngEnvImport = 'angular-server-side-configuration/ng-env';
  tree.visit((path: Path, entry?: Readonly<FileEntry> | null) => {
    if (path.endsWith('.ts') && entry) {
      const content = entry.content.toString('utf8');
      if (content.includes(ngEnv4Import)) {
        const newContent = content.replace(ngEnv4Import, ngEnvImport);
        tree.overwrite(path, newContent);
        variant = 'NG_ENV';
      } else if (content.includes(ngEnvImport)) {
        variant = 'NG_ENV';
      }
    }
  });

  return variant;
}

function removeNgsscJson() {
  return (tree: Tree, context: SchematicContext) => {
    if (tree.exists(NGSSC_JSON_PATH)) {
      tree.delete(NGSSC_JSON_PATH);
      context.logger.info('Removed legacy ngssc.json');
    }
  };
}

function checkNgsscUsageInScripts() {
  return (tree: Tree, context: SchematicContext) => {
    const packageJson = tree.read('/package.json');
    if (!packageJson) {
      return;
    }

    const pkg = JSON.parse(packageJson.toString('utf8'));
    const ngsscUsedInScripts = Object
      .keys(pkg.scripts || {})
      .some(k => pkg.scripts[k].includes('ngssc '));
    if (!ngsscUsedInScripts) {
      return;
    }

    const workspace = getWorkspace(tree);
    const projectName = workspace.defaultProject || Object.keys(workspace.projects)[0];
    context.logger.info('Please remove the ngssc usage from your scripts.');
    context.logger.info(
      `To run the ngssc build, run the command \`ng run ${projectName}:ngsscbuild:production\`.`);
  };
}
