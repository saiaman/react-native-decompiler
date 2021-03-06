import traverse, { NodePath } from '@babel/traverse';
import {
  isNumericLiteral, isFunctionExpression, isIdentifier, File, isMemberExpression, isAssignmentExpression, ArrayExpression, ObjectExpression,
} from '@babel/types';
import ParamMappings from '../interfaces/paramMappings';
import Module from '../module';
import PerformanceTracker from '../util/performanceTracker';

export default class WebpackParser extends PerformanceTracker {
  private readonly PARAM_MAPPING: ParamMappings = {
    module: 0,
    exports: 1,
    require: 2,
  };

  protected parseAst(ast: File, modules: Module[]): void {
    traverse(ast, {
      CallExpression: (nodePath) => {
        const firstArg = nodePath.get('arguments')[0];
        if (isFunctionExpression(nodePath.node.callee) && firstArg?.isArrayExpression()) { // entrypoint
          this.parseArray(ast, firstArg, modules);
        } else if (isMemberExpression(nodePath.node.callee) && isAssignmentExpression(nodePath.node.callee.object) && firstArg?.isArrayExpression()) { // chunked
          const assignment = nodePath.node.callee.object;
          if (isMemberExpression(assignment.left) && isIdentifier(assignment.left.property) && assignment.left.property.name === 'webpackJsonp') {
            const modulesObject = firstArg.get('elements')[1];
            if (modulesObject.isArrayExpression()) {
              this.parseArray(ast, modulesObject, modules);
            } else {
              if (!modulesObject || !modulesObject.isObjectExpression()) throw new Error('Failed assertion');
              this.parseObject(ast, modulesObject, modules);
            }
          }
        }
        nodePath.skip();
      },
    });
  }

  private parseArray(file: File, ast: NodePath<ArrayExpression>, modules: Module[]): void {
    ast.get('elements').forEach((element, i) => {
      if (!element.isFunctionExpression()) return;
      if (element.node.body.body.length === 0) return;

      const dependencyValues: number[] = [];
      const requireIdentifer = element.node.params[2];
      if (!isIdentifier(requireIdentifer)) return;
      element.traverse({
        CallExpression: (dependencyPath) => {
          if (!isIdentifier(dependencyPath.node.callee) || !isNumericLiteral(dependencyPath.node.arguments[0])) return;
          if (dependencyPath.scope.bindingIdentifierEquals(dependencyPath.node.callee.name, requireIdentifer)) {
            dependencyValues[dependencyPath.node.arguments[0].value] = dependencyPath.node.arguments[0].value;
          }
        },
      });

      const newModule = new Module(file, element, i, dependencyValues, this.PARAM_MAPPING);
      newModule.calculateFields();
      modules[i] = newModule;
    });
  }

  private parseObject(file: File, ast: NodePath<ObjectExpression>, modules: Module[]): void {
    ast.get('properties').forEach((property) => {
      if (!property.isObjectProperty() || !isNumericLiteral(property.node.key)) return;

      const element = property.get('value');
      const i = property.node.key.value;
      if (!element.isFunctionExpression()) return;
      if (element.node.body.body.length === 0) return;

      const dependencyValues: number[] = [];
      const requireIdentifer = element.node.params[2];
      if (!isIdentifier(requireIdentifer)) return;
      element.traverse({
        CallExpression: (dependencyPath) => {
          if (!isIdentifier(dependencyPath.node.callee) || !isNumericLiteral(dependencyPath.node.arguments[0])) return;
          if (dependencyPath.scope.bindingIdentifierEquals(dependencyPath.node.callee.name, requireIdentifer)) {
            dependencyValues[dependencyPath.node.arguments[0].value] = dependencyPath.node.arguments[0].value;
          }
        },
      });

      const newModule = new Module(file, element, i, dependencyValues, this.PARAM_MAPPING);
      newModule.calculateFields();
      modules[i] = newModule;
    });
  }
}
