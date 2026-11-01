const fs = require("fs");
const path = require("path");
const logger = require("./logger");

function loadCommands(commandsDir) {
  const commands = {};
  
  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith(".js")) {
        try {
          delete require.cache[require.resolve(filePath)];
          const cmd = require(filePath);
          
          if (cmd && cmd.execute) {
            const cmdNames = Array.isArray(cmd.command) ? cmd.command : [cmd.command || cmd.name];
            
            for (const name of cmdNames) {
              commands[name.toLowerCase()] = cmd;
            }
            
            logger.cmd(`loaded ${cmdNames.join(", ")}`);
          }
        } catch (err) {
          logger.error(`load ${file}: ${err.message}`);
        }
      }
    }
  }
  
  walkDir(commandsDir);
  return commands;
}

function getCommandsByCategory(commands, { includeHidden = false } = {}) {
  const categories = {};
  
  for (const [name, cmd] of Object.entries(commands)) {
    const category = cmd.category || "uncategorized";
    const visible = includeHidden ? true : cmd.visible !== false;
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    if (visible && !categories[category].find(c => c.name === cmd.name)) {
      categories[category].push(cmd);
    }
  }
  
  return categories;
}

module.exports = { loadCommands, getCommandsByCategory };
