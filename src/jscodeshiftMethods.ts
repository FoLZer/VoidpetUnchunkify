import jscodeshift from "jscodeshift";

export default () => jscodeshift.registerMethods({
    renameTo: function(newName: string) {
        //@ts-ignore
        return this.forEach(function(path) {
            //Copied from VariableDeclarator.js
            const node = path.value;
            const oldName = node.id.name;
            const rootScope = path.scope;
            const rootPath = rootScope.path;
            jscodeshift(rootPath)
            .find(jscodeshift.types.namedTypes.Identifier, {name: oldName})
            .filter(function(path) { // ignore non-variables
                const parent = path.parent.node;
      
                if (
                    jscodeshift.types.namedTypes.MemberExpression.check(parent) &&
                    parent.property === path.node &&
                    !parent.computed
                ) {
                    // obj.oldName
                    return false;
                }
      
                if (
                    jscodeshift.types.namedTypes.Property.check(parent) &&
                    parent.key === path.node &&
                    !parent.computed
                ) {
                    // { oldName: 3 }
                    return false;
                }
      
                if (
                    jscodeshift.types.namedTypes.MethodDefinition.check(parent) &&
                    parent.key === path.node &&
                    !parent.computed
                ) {
                    // class A { oldName() {} }
                    return false;
                }
      
                if (
                    jscodeshift.types.namedTypes.ClassProperty.check(parent) &&
                    parent.key === path.node &&
                    !parent.computed
                ) {
                    // class A { oldName = 3 }
                    return false;
                }
      
                if (
                    jscodeshift.types.namedTypes.JSXAttribute.check(parent) &&
                    //@ts-ignore
                    parent.name === path.node &&
                    //@ts-ignore
                    !parent.computed
                ) {
                    // <Foo oldName={oldName} />
                    return false;
                }
      
                return true;
            })
            .forEach(function(path) {
                let scope = path.scope;
                while (scope && scope !== rootScope) {
                    if (scope.declares(oldName)) {
                        return;
                    }
                    scope = scope.parent;
                }
                if (scope) { // identifier must refer to declared variable
      
                    // It may look like we filtered out properties,
                    // but the filter only ignored property "keys", not "value"s
                    // In shorthand properties, "key" and "value" both have an
                    // Identifier with the same structure.
                    const parent = path.parent.node;
                    if (
                        jscodeshift.types.namedTypes.Property.check(parent) &&
                        parent.shorthand &&
                        !parent.method
                    )  {
        
                        path.parent.get('shorthand').replace(false);
                    }
      
                    path.get('name').replace(newName);
                }
            });
        })
    }
}, jscodeshift.FunctionDeclaration);